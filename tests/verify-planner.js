// 사용법: node tests/verify-planner.js
// "다음 학습일 학습 미리 하기"(js/planner.js의 planAdvanceSession)와 그 바탕인 다음 학습일 계산을 검사한다.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {}, console, sim: { today: "2026-11-20" } };
vm.createContext(sandbox);
const load = (f) => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), sandbox);
["hanja.js", "hanja_g6.js", "hanja_g5a.js", "hanja_g5b.js", "hanja_g5c.js", "hanja_extra.js", "hanja_sentences.js", "hanja_strokes.js", "hanja_meta.js", "hanja_build.js"].forEach(load);
vm.runInContext("window.HanjaApp.store = { todayStr: () => sim.today };", sandbox);
["srs.js", "quiz.js", "planner.js", "progression.js"].forEach(load);
const A = sandbox.window.HanjaApp;
const P = A.planner;

let errors = 0;
const check = (cond, msg) => {
  if (!cond) {
    errors++;
    console.error("✗", msg);
  }
};

// 1) 다음 학습일: 토·일은 건너뛴다 (2026-11-20은 금요일)
const next = (d) => P.nextStudyDay(d);
check(next("2026-11-19") === "2026-11-20", "목요일의 다음 학습일은 금요일");
check(next("2026-11-20") === "2026-11-23", "금요일의 다음 학습일은 월요일");
check(next("2026-11-21") === "2026-11-23", "토요일의 다음 학습일은 월요일");
check(next("2026-11-22") === "2026-11-23", "일요일의 다음 학습일은 월요일");

// 2) 오늘 학습을 마친 상태(금요일): 오늘 복습은 없고, 월요일에 돌아올 복습과 더 먼 복습이 섞여 있다
const words = A.HANJA.filter((h) => h.grade === "8");
const study = A.progression.studyTypesFor;
const card = (level, nextDay) => ({ level, next: nextDay, correct: 2, wrong: 0, lastSeen: "2026-11-19", seen: 2 });
const progress = {};
// 월요일에 돌아올 복습: 앞의 2자는 10개 이하(전부 들어옴), 5자까지 늘리면 한 번에 최대 문제 수 때문에 잘린다
words.slice(0, 2).forEach((h) => (progress[h.id] = Object.fromEntries(study(h).map((t) => [t, card(2, "2026-11-23")]))));
words.slice(5, 9).forEach((h) => (progress[h.id] = Object.fromEntries(study(h).map((t) => [t, card(3, "2026-12-07")]))));
const ctx = { words, progress, newWordsToday: 12, today: "2026-11-20", typesFor: study };

const normal = P.planStudySession(ctx);
check(normal.reviews.length === 0 && normal.newItems.length === 0, "오늘 할 것이 없어야 함(이미 새 문제를 냈고 복습일이 안 됨)");

const adv = P.planAdvanceSession(ctx);
check(adv.day === "2026-11-23", "금요일에 미리 하면 월요일 학습이어야 함");
const expectedDue = words.slice(0, 2).reduce((n, h) => n + study(h).length, 0);
check(expectedDue <= 10, "테스트 준비: 월요일 복습은 10개 이하여야 함");
check(adv.reviews.length === expectedDue, `월요일에 돌아올 복습 ${expectedDue}개가 모두 들어와야 함 (실제 ${adv.reviews.length})`);
check(adv.reviews.every((it) => it.next <= "2026-11-23"), "월요일 이후에 돌아오는 복습은 넣지 않아야 함");
check(adv.newItems.length > 0, "새 문제도 미리 할 수 있어야 함");
check(adv.reviews.length + adv.newItems.length <= P.MAX_SESSION_SIZE, "한 번에 최대 문제 수를 넘으면 안 됨");
check(adv.newItems.length <= P.NEW_PER_DAY, "새 문제는 하루 몫을 넘으면 안 됨");
// 월요일에 안 돌아오는 한자(5~8번째)의 기존 카드는 복습으로 들어오지 않는다
const farIds = new Set(words.slice(5, 9).map((h) => h.id));
check(!adv.reviews.some((it) => farIds.has(it.word.id)), "복습일이 먼 카드가 당겨져 들어오면 안 됨");

// 복습이 한 번에 푸는 최대 수를 넘으면 새 문제 최소 몫을 남기고 잘린다 (새 10 + 복습 20 = 30)
const many = { ...progress };
words.slice(2, 5).forEach((h) => (many[h.id] = Object.fromEntries(study(h).map((t) => [t, card(2, "2026-11-23")]))));
const manyDue = P.computeDueItems({ ...ctx, progress: many, asOf: "2026-11-23" }).length;
check(manyDue > 20, "테스트 준비: 복습이 20개를 넘어야 함");
const advMany = P.planAdvanceSession({ ...ctx, progress: many });
check(advMany.newItems.length === P.MIN_NEW_PER_SESSION, `복습이 많으면 새 문제는 최소 ${P.MIN_NEW_PER_SESSION}개 (실제 ${advMany.newItems.length})`);
check(advMany.reviews.length === P.MAX_SESSION_SIZE - P.MIN_NEW_PER_SESSION, "복습은 최대 문제 수에서 새 문제를 뺀 만큼만 들어옴");

// 3) 기본 동작은 그대로: asOf를 주지 않으면 복습일이 안 된 카드는 복습이 아님
check(P.computeDueItems(ctx).length === 0, "미리 하기가 아닌 복습 계산에서는 복습일이 안 된 카드가 나오면 안 됨");
check(P.computeDueItems({ ...ctx, asOf: "2026-11-23" }).length === expectedDue, "asOf를 주면 그 날짜까지의 복습이 나와야 함");

// 4) 주말(토요일): 오늘은 복습이 없으면 쉬고, 월요일 학습은 미리 할 수 있다
sandbox.sim.today = "2026-11-21";
const sat = { ...ctx, today: "2026-11-21", newWordsToday: 0 };
const satNormal = P.planStudySession(sat);
check(satNormal.reviews.length === 0 && satNormal.newItems.length === 0, "주말에 복습이 없으면 오늘의 학습은 비어 있어야 함");
const satAdv = P.planAdvanceSession(sat);
check(satAdv.day === "2026-11-23", "토요일에 미리 하면 월요일 학습");
check(satAdv.reviews.length === expectedDue && satAdv.newItems.length > 0, "토요일에도 월요일 복습과 새 문제를 미리 할 수 있어야 함");

// 5) 할 것이 정말 없는 경우: 모든 한자를 배웠고 복습일이 모두 한참 뒤
const full = {};
words.forEach((h) => (full[h.id] = Object.fromEntries(study(h).map((t) => [t, card(5, "2027-03-01")]))));
sandbox.sim.today = "2026-11-20";
const none = P.planAdvanceSession({ words, progress: full, newWordsToday: 12, today: "2026-11-20", typesFor: study });
check(none.reviews.length + none.newItems.length === 0, "미리 할 것이 없으면 비어 있어야 함");

if (errors) {
  console.error(`실패: ${errors}건`);
  process.exit(1);
}
console.log("✓ 다음 학습일 미리 하기 검증 통과");
