// 사용법: node tools/simulate-progression.js [--runs 80] [--max-days 6000]
//
// "급수 마스터" 단계별 해금 방식으로 공부하면 5급까지 마스터하는 데 얼마나 걸리는지 시뮬레이션한다.
// 앱의 실제 복습 규칙(js/srs.js)과 출제 규칙(js/planner.js)을 그대로 불러와서 쓰고,
// 아래 규칙만 그 위에 얹는다.
//
//  - 처음에는 8급 한자만 나온다. 한 급수의 한자가 전부 "마스터 레벨"에 이르면 그 급수 마스터가 되고,
//    그다음 접속부터 다음 급수 문제가 함께 나온다(앞 급수 복습도 계속 나온다).
//  - 마스터 기준: 그 급수의 모든 한자에서, 그 한자에 나오는 핵심 유형 카드가 모두 레벨 L 이상(js/progression.js).
//  - 사용자는 N일마다 접속해서 "오늘의 학습"을 한 번 푼다. 주말 규칙(복습이 토·일에는 돌아오지 않음)도 앱 그대로다.
//  - 정답률: 급수별 처음 정답률에서 시작해, 같은 문제(한자×유형 카드)를 다시 만날 때마다 +10%p씩 올라간다(최대 100%).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(argv[i + 1]);
};
const RUNS = arg("runs", 80);
const MAX_DAYS = arg("max-days", 6000);

// ---------- 앱 코드를 불러온다 (화면·저장소 없이) ----------
const sandbox = { window: {}, console };
vm.createContext(sandbox);
const sim = { today: "2026-11-23" };
sandbox.sim = sim;
sandbox.__rng = Math.random;
vm.runInContext("Math.random = () => __rng();", sandbox);
const load = (f) => vm.runInContext(fs.readFileSync(path.join(root, "js", f), "utf8"), sandbox);
["hanja.js", "hanja_g6.js", "hanja_g5a.js", "hanja_g5b.js", "hanja_g5c.js", "hanja_extra.js", "hanja_sentences.js", "hanja_strokes.js", "hanja_meta.js", "hanja_build.js"].forEach(load);
// srs.js는 불러올 때 store.todayStr를 잡아 두므로, 시뮬레이션 날짜를 돌려주는 가짜 store를 먼저 둔다
vm.runInContext("window.HanjaApp.store = { todayStr: () => sim.today };", sandbox);
["srs.js", "quiz.js", "planner.js", "progression.js"].forEach(load);
const A = sandbox.window.HanjaApp;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRADES = A.EXAM_GRADES; // ["8","7","6","5p","5"]
const WORDS_BY_GRADE = Object.fromEntries(GRADES.map((g) => [g, A.HANJA.filter((h) => h.grade === g)]));
const CORE = new Set(A.quiz.CORE_TYPES);
// 같은 계산을 수천 번 되풀이하므로 한자별 유형 목록은 한 번만 계산해 둔다
const typeCache = new Map();
const cached = (key, fn) => (h) => {
  const k = `${key}:${h.id}`;
  if (!typeCache.has(k)) typeCache.set(k, fn(h));
  return typeCache.get(k);
};
const allTypesFor = cached("all", (h) => A.quiz.typesFor(h));
const coreTypesFor = cached("core", (h) => A.quiz.typesFor(h).filter((t) => CORE.has(t)));
const START = new Date(2026, 10, 23); // 2026-11-23 월요일
const dateStr = (offset) => {
  const d = new Date(START.getFullYear(), START.getMonth(), START.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ---------- 한 번의 시뮬레이션 ----------
// opts: {every, level, asked: "all"|"core-first"|"core", base:{급수:정답률}, gain, perHanja}
function run(opts, seed) {
  // 앱 코드(vm 안의 Math.random)와 정답 여부 추첨이 같은 시드 난수를 쓰게 해서, 같은 시드면 항상 같은 결과가 나온다
  const rng = mulberry32(seed);
  sandbox.__rng = rng;
  const progress = {};
  const encounters = new Map();
  const unlocked = opts.gating === false ? [...GRADES] : [GRADES[0]]; // gating:false면 처음부터 모든 급수를 섞어 낸다(비교용)
  const titles = {}; // 급수 → {day, visit}
  let visits = 0;
  let emptyVisits = 0;
  let questions = 0;
  let maintenance = 0; // 이미 호칭을 얻은 급수의 문제(유지 복습) 수
  const typesFor = opts.asked === "core" ? coreTypesFor : allTypesFor;

  // 마스터 판정은 앱과 같은 js/progression.js를 쓴다
  const hanjaMastered = (h) => A.progression.hanjaMastered(h, progress, opts.level);
  const masteredShare = (g) => WORDS_BY_GRADE[g].filter(hanjaMastered).length / WORDS_BY_GRADE[g].length;
  const gradeMastered = (g) => masteredShare(g) === 1;

  for (let day = 0; day <= MAX_DAYS; day += opts.every) {
    sim.today = dateStr(day);
    const words = A.HANJA.filter((h) => unlocked.includes(h.grade));
    const ctx = {
      words, progress, newWordsToday: 0, today: sim.today, typesFor, coreFirst: opts.asked === "core-first",
      newPerDay: opts.newPerDay, minNew: opts.minNew, maxSession: opts.maxSession,
    };
    const plan = A.planner.planStudySession(ctx);
    const items = A.quiz.shuffle([...plan.reviews, ...plan.newItems]);
    visits++;
    if (!items.length) emptyVisits++;
    items.forEach(({ word, type }) => {
      const key = opts.perHanja ? word.id : `${word.id}|${type}`;
      const seen = encounters.get(key) || 0;
      const p = Math.min(1, opts.base[word.grade] + opts.gain * seen);
      const correct = rng() < p;
      const rec = progress[word.id] || (progress[word.id] = {});
      rec[type] = A.srs.recordAnswer(rec[type] || A.srs.newCard(), correct);
      encounters.set(key, seen + 1);
      questions++;
      if (titles[word.grade] !== undefined) maintenance++;
    });
    // 이번 접속을 마친 뒤 확인한다: 마스터(전부 레벨 이상)하면 호칭을 얻고, 다음 급수는
    // opts.unlockShare(기본 100%) 이상 마스터했을 때 해금한다.
    for (const g of [...unlocked]) {
      const share = masteredShare(g);
      if (titles[g] === undefined && share === 1) titles[g] = { day, visit: visits };
      const next = GRADES[GRADES.indexOf(g) + 1];
      if (next && !unlocked.includes(next) && share >= (opts.unlockShare ?? 1)) unlocked.push(next);
    }
    if (titles[GRADES[GRADES.length - 1]] !== undefined) break;
  }
  return { titles, visits, emptyVisits, questions, maintenance };
}

// ---------- 결과 정리 ----------
const pct = (arr, q) => {
  const a = [...arr].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null;
};
const BASE = { 8: 0.5, 7: 0.4, 6: 0.3, "5p": 0.2, 5: 0.1 };
const label = (g) => A.GRADE_INFO[g].label;

function scenario(name, opts) {
  const results = [];
  for (let i = 0; i < RUNS; i++) results.push(run(opts, 1000 + i));
  const out = { name, opts, runs: RUNS, perGrade: {} };
  GRADES.forEach((g) => {
    const days = results.map((r) => r.titles[g]?.day).filter((d) => d !== undefined);
    out.perGrade[g] = { reached: days.length, median: pct(days, 0.5), p10: pct(days, 0.1), p90: pct(days, 0.9) };
  });
  const finished = results.filter((r) => r.titles[GRADES[GRADES.length - 1]] !== undefined);
  out.finished = finished.length;
  out.avgQuestionsPerVisit = Math.round(results.reduce((n, r) => n + r.questions / r.visits, 0) / results.length);
  out.emptyShare = Math.round((results.reduce((n, r) => n + r.emptyVisits / r.visits, 0) / results.length) * 100);
  return out;
}

const fmt = (days) => (days === null ? "—" : `${days}일 (${(days / 30.4).toFixed(1)}개월)`);
function print(res) {
  console.log(`\n### ${res.name}`);
  console.log(`| 급수 마스터 | 중앙값 | 빠른 10% | 느린 10% | 도달 |`);
  console.log(`| --- | --- | --- | --- | --- |`);
  GRADES.forEach((g) => {
    const r = res.perGrade[g];
    console.log(`| ${label(g)} | ${fmt(r.median)} | ${fmt(r.p10)} | ${fmt(r.p90)} | ${r.reached}/${res.runs} |`);
  });
  console.log(`접속당 평균 ${res.avgQuestionsPerVisit}문제, 문제가 없어서 빈 접속 ${res.emptyShare}%`);
}

module.exports = { run, scenario, print, BASE, RUNS };

const BASE_OPTS = { every: 2, level: 4, asked: "all", base: BASE, gain: 0.1, perHanja: false };
const SCENARIOS = {
  A: ["A. 지금 앱 그대로 (모든 유형 출제) · 2일마다 접속 · 마스터 레벨 4", BASE_OPTS],
  B: ["B. 핵심 유형을 먼저 출제 · 2일마다 · 레벨 4", { ...BASE_OPTS, asked: "core-first" }],
  C: ["C. 핵심 유형만 출제 · 2일마다 · 레벨 4", { ...BASE_OPTS, asked: "core" }],
  D: ["D. 핵심 유형만 · 2일마다 · 마스터 레벨 3(쉬움)", { ...BASE_OPTS, asked: "core", level: 3 }],
  E: ["E. 핵심 유형만 · 2일마다 · 마스터 레벨 5(어려움)", { ...BASE_OPTS, asked: "core", level: 5 }],
  F: ["F. 핵심 유형만 · 매일 접속 · 레벨 4", { ...BASE_OPTS, asked: "core", every: 1 }],
  G: ["G. 핵심 유형만 · 2일마다 · 한 번에 40문제(새 문제 20개) · 레벨 4", { ...BASE_OPTS, asked: "core", maxSession: 40, newPerDay: 20, minNew: 8 }],
  H: ["H. 핵심 유형만 · 2일마다 · 레벨 4 · 정답률 상승을 한자 단위로 셈", { ...BASE_OPTS, asked: "core", perHanja: true }],
  J: ["J. (비교) 급수 해금 없이 250자를 처음부터 섞어 출제 · 핵심 유형만 · 2일마다 · 레벨 4", { ...BASE_OPTS, asked: "core", gating: false }],
  K: ["K. 핵심 유형만 · 2일마다 · 레벨 4 · 90% 마스터하면 다음 급수 해금(호칭은 100%일 때)", { ...BASE_OPTS, asked: "core", unlockShare: 0.9 }],
  I: ["I. 모든 유형 · 2일마다 · 레벨 4 · 정답률 상승을 한자 단위로 셈", { ...BASE_OPTS, perHanja: true }],
};
module.exports.SCENARIOS = SCENARIOS;

if (require.main === module) {
  const ids = (argv.includes("--scenarios") ? argv[argv.indexOf("--scenarios") + 1] : Object.keys(SCENARIOS).join(",")).split(",");
  ids.forEach((id) => print(scenario(SCENARIOS[id][0], SCENARIOS[id][1])));
}
