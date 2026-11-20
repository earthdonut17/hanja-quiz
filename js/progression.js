window.HanjaApp = window.HanjaApp || {};

// 급수 마스터 호칭과 단계별 해금 규칙. 화면에 의존하지 않는 순수 함수라서
// 앱과 시뮬레이터(tools/simulate-progression.js)가 같은 코드를 쓴다.
//
//  - 8급 → 7급 → 6급 → 준5급 → 5급 순서로 단계가 열린다. 처음에는 8급만 나온다.
//  - 한 급수의 모든 한자에서 "오늘의 학습에 나오는 유형"(핵심 5유형) 카드가 모두 MASTER_LEVEL 이상이면
//    그 급수의 마스터 호칭을 받고, 그다음 급수가 열린다.
//  - 오늘의 학습은 핵심 유형만 낸다. 나머지 유형은 자유 연습과 모의고사에서 만난다.
(function () {
  const A = window.HanjaApp;

  const MASTER_LEVEL = 4; // 복습 간격 15일 단계. 전부 정답이면 첫 학습 12일 만에 도달한다

  // 오늘의 학습(복습 일정)에 쓰는 유형: 그 한자에 낼 수 있는 핵심 유형
  const CORE = new Set(A.quiz.CORE_TYPES);
  const studyTypesFor = (h) => A.quiz.typesFor(h).filter((t) => CORE.has(t));

  const hanjaMastered = (h, progress, level = MASTER_LEVEL) => {
    const rec = progress[h.id];
    return !!rec && studyTypesFor(h).every((t) => rec[t] && rec[t].level >= level);
  };

  // 한 급수의 마스터 진행: {done: 마스터한 한자 수, total: 한자 수}
  function gradeStatus(grade, progress, level = MASTER_LEVEL) {
    const words = A.HANJA.filter((h) => h.grade === grade);
    return { done: words.filter((h) => hanjaMastered(h, progress, level)).length, total: words.length };
  }

  // 호칭(titles: {급수: 받은 날짜})을 바탕으로 지금 열려 있는 급수 목록
  function unlockedGrades(titles) {
    const ladder = A.EXAM_GRADES;
    const out = [ladder[0]];
    for (let i = 0; i < ladder.length - 1; i++) {
      if (!titles[ladder[i]]) break;
      out.push(ladder[i + 1]);
    }
    return out;
  }

  // 새로 마스터한 급수에 호칭을 준다(titles를 직접 고친다). 돌려주는 값은 이번에 새로 받은 급수 목록.
  // 이미 많이 공부한 계정은 앞 급수 호칭이 한꺼번에 주어질 수 있다.
  function awardTitles(titles, progress, today, level = MASTER_LEVEL) {
    const earned = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const g of unlockedGrades(titles)) {
        if (titles[g]) continue;
        const { done, total } = gradeStatus(g, progress, level);
        if (done === total) {
          titles[g] = today;
          earned.push(g);
          changed = true;
        }
      }
    }
    return earned;
  }

  // 가장 높은 호칭의 급수 (없으면 null)
  function highestTitle(titles) {
    const ladder = A.EXAM_GRADES;
    for (let i = ladder.length - 1; i >= 0; i--) if (titles[ladder[i]]) return ladder[i];
    return null;
  }

  A.progression = { MASTER_LEVEL, studyTypesFor, hanjaMastered, gradeStatus, unlockedGrades, awardTitles, highestTitle };
})();
