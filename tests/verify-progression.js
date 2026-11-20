// 사용법: node tests/verify-progression.js
// 급수 마스터 호칭·단계별 해금 규칙(js/progression.js)과, 오늘의 학습이 핵심 유형만 내는지(js/planner.js)를 검사한다.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {}, console, sim: { today: "2026-11-23" } };
vm.createContext(sandbox);
const load = (f) => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), sandbox);
["hanja.js", "hanja_g6.js", "hanja_g5a.js", "hanja_g5b.js", "hanja_g5c.js", "hanja_extra.js", "hanja_sentences.js", "hanja_strokes.js", "hanja_meta.js", "hanja_build.js"].forEach(load);
vm.runInContext("window.HanjaApp.store = { todayStr: () => sim.today };", sandbox);
["srs.js", "quiz.js", "planner.js", "progression.js"].forEach(load);
const A = sandbox.window.HanjaApp;
const P = A.progression;

let errors = 0;
const check = (cond, msg) => {
  if (!cond) {
    errors++;
    console.error("✗", msg);
  }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const card = (level) => ({ level, next: "2099-01-04", correct: 3, wrong: 0, lastSeen: "2026-11-23", seen: 3 });
const progressFor = (grades, level) => {
  const progress = {};
  A.HANJA.filter((h) => grades.includes(h.grade)).forEach((h) => {
    progress[h.id] = Object.fromEntries(P.studyTypesFor(h).map((t) => [t, card(level)]));
  });
  return progress;
};

// 1) 해금 순서
check(same(P.unlockedGrades({}), ["8"]), "처음에는 8급만 열려야 함");
check(same(P.unlockedGrades({ 8: "d" }), ["8", "7"]), "8급 호칭이 있으면 7급이 열려야 함");
check(same(P.unlockedGrades({ 7: "d" }), ["8"]), "8급 호칭 없이 7급 호칭만 있으면 8급만 열려야 함");
check(same(P.unlockedGrades({ 8: "d", 7: "d", 6: "d", "5p": "d" }), ["8", "7", "6", "5p", "5"]), "준5급까지 호칭이 있으면 5급까지 열려야 함");

// 2) 마스터 판정: 레벨 3은 안 되고 4는 됨, 한 장이라도 모자라면 안 됨
check(P.gradeStatus("8", progressFor(["8"], 3)).done === 0, "레벨 3은 마스터가 아님");
check(P.gradeStatus("8", progressFor(["8"], 4)).done === 30, "레벨 4면 8급 30자 모두 마스터");
const almost = progressFor(["8"], 4);
const firstId = Object.keys(almost)[0];
almost[firstId][P.studyTypesFor(A.HANJA_BY_ID.get(firstId))[0]].level = 3;
check(P.gradeStatus("8", almost).done === 29, "한 카드가 레벨 3이면 그 한자는 마스터가 아님");

// 3) 호칭 부여
let titles = {};
check(same(P.awardTitles(titles, almost, "2026-11-23"), []), "29/30이면 호칭이 없어야 함");
titles = {};
check(same(P.awardTitles(titles, progressFor(["8"], 4), "2026-11-23"), ["8"]) && same(titles, { 8: "2026-11-23" }), "8급만 마스터하면 8급 호칭만");
titles = {};
check(same(P.awardTitles(titles, progressFor(["8", "7"], 5), "2026-11-23"), ["8", "7"]), "8·7급을 이미 마스터한 계정은 호칭이 한꺼번에 주어져야 함");
titles = {};
check(same(P.awardTitles(titles, progressFor(["7"], 5), "2026-11-23"), []), "8급을 건너뛴 7급 진도는 호칭이 없어야 함(열린 급수만 심사)");
check(P.highestTitle({ 8: "d", 7: "d" }) === "7" && P.highestTitle({}) === null, "가장 높은 호칭 계산");

// 4) 오늘의 학습은 핵심 유형만 낸다 (5급 전체를 열어 두고 여러 날 반복)
const core = new Set(A.quiz.CORE_TYPES);
const progress = {};
const words = A.HANJA.filter((h) => h.grade !== "x");
for (let day = 0; day < 12; day++) {
  sandbox.sim.today = `2026-12-${String(1 + day * 2).padStart(2, "0")}`;
  const plan = A.planner.planStudySession({ words, progress, newWordsToday: 0, today: sandbox.sim.today, typesFor: P.studyTypesFor });
  [...plan.reviews, ...plan.newItems].forEach(({ word, type }) => {
    check(core.has(type), `오늘의 학습에 핵심이 아닌 유형 ${type}가 나옴 (${word.hanja})`);
    const rec = progress[word.id] || (progress[word.id] = {});
    rec[type] = A.srs.recordAnswer(rec[type] || A.srs.newCard(), true);
  });
}
check(Object.keys(progress).length > 0, "학습 기록이 쌓여야 함");

if (errors) {
  console.error(`실패: ${errors}건`);
  process.exit(1);
}
console.log("✓ 급수 마스터·해금 규칙 검증 통과");
