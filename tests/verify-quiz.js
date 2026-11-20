// 사용법: node tests/verify-quiz.js
// 문제 생성기를 대량으로 돌려서 모든 문제가 규칙을 지키는지 검사한다.
//  - 보기는 정확히 4개, 값이 서로 다르고 정답이 그 안에 있다.
//  - 정답이 하나뿐이다(오답 보기가 사실은 정답인 경우를 걸러낸다).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {}, console };
vm.createContext(sandbox);
const FILES = [
  "hanja.js", "hanja_g6.js", "hanja_g5a.js", "hanja_g5b.js", "hanja_g5c.js", "hanja_extra.js",
  "hanja_sentences.js", "hanja_strokes.js", "hanja_meta.js", "hanja_build.js", "quiz.js", "mockexam.js",
];
for (const f of FILES) {
  const file = path.join(__dirname, "..", "js", f);
  if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, "utf8"), sandbox);
}
const A = sandbox.window.HanjaApp;
const { HANJA, quiz } = A;

let errors = 0;
const fail = (msg) => {
  errors++;
  if (errors <= 40) console.error("✗", msg);
};

const ROUNDS = 60;
const counts = {};
const failedBuild = {};

function checkQuestion(q, where) {
  const vals = q.options.map((o) => o.value);
  if (vals.length !== 4) fail(`${where} ${q.type}: 보기가 ${vals.length}개`);
  if (new Set(vals).size !== vals.length) fail(`${where} ${q.type}: 보기가 겹침 ${vals.join("|")}`);
  if (!vals.includes(q.answer)) fail(`${where} ${q.type}: 정답 ${q.answer}가 보기에 없음`);
  if (!q.label || !q.stem || !q.stem.length) fail(`${where} ${q.type}: 지시문/본문 없음`);
  if (!q.explain) fail(`${where} ${q.type}: 해설 없음`);
  if (!q.word) fail(`${where} ${q.type}: 한자와 연결되지 않은 문제(모든 문제는 한자 문제여야 함)`);
  // 유형별 추가 검사
  if (q.type === "word_write" || q.type === "sentence_write") {
    // 정답 한자어는 보기 중 하나뿐이고, 같은 독음의 실제 낱말이 오답으로 들어가면 안 된다
    const ans = A.HANJA.flatMap((h) => h.words).find((w) => w.h === q.answer);
    vals.forEach((v) => {
      if (v === q.answer) return;
      const real = A.HANJA.flatMap((h) => h.words).find((w) => w.h === v);
      if (real && ans && real.r === ans.r) fail(`${where} ${q.type}: 동음이의 낱말 ${v}가 오답으로 나옴 (정답 ${q.answer})`);
    });
  }
  if (q.type === "stroke_count") {
    const wrong = vals.filter((v) => {
      const [c, n] = [v[0], Number(v.match(/총(\d+)획/)[1])];
      return HANJA.find((h) => h.hanja === c).strokes !== n;
    });
    if (wrong.length !== 1 || wrong[0] !== q.answer) fail(`${where} stroke_count: 틀린 보기가 ${wrong.length}개 (${vals.join("|")})`);
  }
  if (q.type === "category_pick") {
    const catOf = (c) => HANJA.find((h) => h.hanja === c).category;
    const cats = vals.map(catOf);
    const answerCat = catOf(q.answer);
    const same = cats.filter((c) => c === answerCat).length;
    const negative = q.label.includes("아닌");
    if (negative && same !== 1) fail(`${where} category_pick(아닌 것): 정답과 같은 갈래가 ${same}개`);
    if (!negative && same !== 1) fail(`${where} category_pick: 정답 갈래 한자가 ${same}개`);
  }
  if (q.type === "antonym_char" || q.type === "synonym_char") {
    const owner = q.word;
    vals.forEach((v) => {
      if (v === q.answer) return;
      const o = HANJA.find((h) => h.hanja === v);
      if (owner.antonym === v || (owner.synonyms || []).includes(v)) fail(`${where} ${q.type}: 오답 ${v}가 사실 정답 관계`);
    });
  }
  if (q.type === "common_char") {
    const patterns = q.stem[0].items;
    vals.forEach((v) => {
      if (v === q.answer) return;
      const fits = patterns.filter((p) => A.HANJA.some((h) => h.words.some((w) => w.h === p.replace("□", v))));
      if (fits.length) fail(`${where} common_char: 오답 ${v}가 ${fits.join(",")}에서 낱말이 됨`);
    });
  }
}

// 1) 모든 한자 × 모든 유형을 여러 번 만들어 본다 (공부 범위가 작은 경우도 시험한다)
const pools = {
  "8급만": A.poolForGrade("8"),
  "7급까지": A.poolForGrade("7"),
  "6급까지": A.poolForGrade("6"),
  "5급까지": A.poolForGrade("5"),
  "전체(교재 포함)": HANJA,
};
for (const [name, pool] of Object.entries(pools)) {
  for (const h of pool) {
    for (const t of quiz.typesFor(h)) {
      for (let i = 0; i < ROUNDS / 6; i++) {
        const q = quiz.BUILDERS[t](h, pool.length >= 4 ? pool : HANJA);
        if (!q) {
          failedBuild[`${name}:${t}`] = (failedBuild[`${name}:${t}`] || 0) + 1;
          continue;
        }
        counts[t] = (counts[t] || 0) + 1;
        checkQuestion(q, `[${name}] ${h.hanja}`);
      }
    }
  }
}

// 2) buildQuestion은 항상 문제를 돌려줘야 한다
for (const h of HANJA) {
  const q = quiz.buildQuestion(h, A.poolForGrade("8"), quiz.pickOne(quiz.typesFor(h)));
  if (!q) fail(`${h.hanja}: buildQuestion이 문제를 만들지 못함`);
  else checkQuestion(q, `[buildQuestion] ${h.hanja}`);
}

// 3) 모의고사
if (A.mock) {
  for (const g of A.EXAM_GRADES) {
    for (let r = 0; r < 20; r++) {
      const exam = A.mock.build(g);
      const spec = A.mock.BLUEPRINT[g];
      const total = spec.reduce((n, [, c]) => n + c, 0);
      if (exam.questions.length !== total) fail(`${g}급 모의고사 문항 수 ${exam.questions.length} (기대 ${total})`);
      exam.questions.forEach((q, i) => checkQuestion(q, `[mock ${g}급 #${i + 1}]`));
      const owners = exam.questions.filter((q) => q.word).map((q) => q.word.id);
      const dup = owners.length - new Set(owners).size;
      if (dup > Math.ceil(total * 0.15)) fail(`${g}급 모의고사에서 같은 한자가 너무 자주 나옴 (겹침 ${dup}개)`);
      const outOfRange = exam.questions.filter((q) => q.word && q.word.grade === "x");
      if (outOfRange.length) fail(`${g}급 모의고사에 교재 한자가 나옴`);
      const pool = new Set(A.poolForGrade(g).map((h) => h.id));
      exam.questions.forEach((q) => q.word && !pool.has(q.word.id) && fail(`${g}급 모의고사에 범위 밖 한자 ${q.word.hanja}`));
    }
  }
}

console.log("만든 문제 수:", Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(", "));
const fb = Object.entries(failedBuild);
if (fb.length) console.log("만들지 못한 경우(다른 유형으로 대체됨):", fb.map(([k, n]) => `${k} ×${n}`).join(", "));
if (errors) {
  console.error(`실패: ${errors}건`);
  process.exit(1);
}
console.log("✓ 문제 생성 검증 통과");
