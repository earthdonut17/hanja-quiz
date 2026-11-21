window.HanjaApp = window.HanjaApp || {};

// 오늘의 학습에 어떤 문제를 낼지 정하는 규칙. 화면(main.js)과 시뮬레이터(tools/simulate-progression.js)가
// 같은 코드를 쓰도록 화면에 의존하지 않는 순수 함수로 분리했다.
//
// ctx(계산에 필요한 값):
//   words          공부할 한자 목록
//   progress       progress[한자 id][문제 유형] = 카드(복습 레벨·다음 복습일 등)
//   newWordsToday  오늘 이미 낸 새 문제 수
//   today          오늘 날짜 "YYYY-MM-DD"
//   typesFor?      한자별로 낼 수 있는 유형 (기본: quiz.typesFor)
//   basicTypes?    처음 보는 한자에게 먼저 내는 유형 (기본: quiz.BASIC_TYPES)
//   coreFirst?     true면 새 유형을 고를 때 핵심 유형(훈음·한자·독음·한자어 쓰기·문장 한자)을 먼저 낸다
//   asOf?          이 날짜까지 복습일이 돌아오는 카드를 "복습 대상"으로 본다(기본: 오늘). 다음 학습일 학습을 미리 할 때 쓴다
//   newPerDay?, minNew?, maxSession?   하루 새 문제 수 / 최소 새 문제 수 / 한 번에 푸는 최대 수 (시뮬레이션용. 기본은 아래 상수)
(function () {
  const A = window.HanjaApp;

  // 하루 학습량: 복습이 없으면 새 문제 20개, 복습이 쌓이면 새 문제 10개 + 복습 20개 = 최대 30문제
  const NEW_PER_DAY = 20; // 하루에 새로 시작하는 문제 수
  const MIN_NEW_PER_SESSION = 10; // 복습이 많은 날에도 최소한 새로 배우는 수
  const MAX_SESSION_SIZE = 30; // 한 번에 푸는 최대 문제 수

  const env = (ctx) => ({
    typesFor: ctx.typesFor || A.quiz.typesFor,
    basic: ctx.basicTypes || A.quiz.BASIC_TYPES,
    shuffle: A.quiz.shuffle,
  });

  // (한자, 문제유형) 쌍 하나하나를 독립된 카드로 보고, 한 번이라도 푼 적 있는 카드 중
  // 복습 기한이 된 것만 모은다. 아직 안 푼 유형은 computeNewCandidates()가 맡는다.
  function computeDueItems(ctx) {
    const { typesFor } = env(ctx);
    const items = [];
    ctx.words.forEach((w) => {
      const rec = ctx.progress[w.id];
      if (!rec) return;
      typesFor(w).forEach((type) => {
        const card = rec[type];
        if (!card) return;
        const day = A.srs.dueDate(card);
        const due = ctx.asOf ? !day || day <= ctx.asOf : A.srs.isDue(card);
        if (due) items.push({ word: w, type, next: day, level: card.level });
      });
    });
    return items;
  }

  // 아직 한 번도 안 푼 (한자, 문제유형) 쌍의 후보를 두 갈래로 나눈다.
  // - fresh: 처음 보는 한자. 기본 유형 중 하나를 첫 문제로 낸다.
  // - expand: 이미 배운 한자의 아직 안 푼 유형. 오늘 이미 푼 한자는 빼서 다음 날부터 나오게 한다.
  //   기본 유형이 아닌 유형은 그 한자를 기본 유형에서 한 번이라도 맞힌 뒤에만 낸다.
  function computeNewCandidates(ctx) {
    const { typesFor, basic, shuffle } = env(ctx);
    const core = new Set(A.quiz.CORE_TYPES);
    const fresh = [];
    const expand = [];
    ctx.words.forEach((w) => {
      const rec = ctx.progress[w.id];
      if (!rec) {
        fresh.push({ word: w, type: basic[Math.floor(Math.random() * basic.length)] });
        return;
      }
      if (Object.values(rec).some((card) => card && card.lastSeen === ctx.today)) return;
      const knowsWord = basic.some((t) => (rec[t]?.correct || 0) > 0);
      const types = knowsWord ? typesFor(w) : basic;
      types.forEach((type) => {
        if (!rec[type]) expand.push({ word: w, type });
      });
    });
    let expandList = shuffle(expand);
    if (ctx.coreFirst) expandList = [...expandList.filter((it) => core.has(it.type)), ...expandList.filter((it) => !core.has(it.type))];
    return { fresh: shuffle(fresh), expand: expandList };
  }

  // 신규 자리의 절반(홀수면 하나 더)은 새 한자, 나머지 절반은 배운 한자의 다른 유형으로 채운다.
  // 한쪽 후보가 모자라면 다른 쪽으로 채운다.
  function splitNewSlots(total, freshAvail, expandAvail) {
    const expand = Math.min(expandAvail, Math.max(total - Math.ceil(total / 2), total - freshAvail));
    const fresh = Math.min(freshAvail, total - expand);
    return { fresh, expand };
  }

  const sortReviews = (ctx, dueItems) =>
    env(ctx).shuffle(dueItems).sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : a.level - b.level));

  // 오늘의 학습 한 세션의 구성. 신규 자리는 하루 한도 안에서 복습이 적으면 많이, 복습이 많아도 최소 개수.
  // 복습은 신규를 뺀 자리만큼만 가장 오래 밀린 것부터 넣는다. 새 문제는 그날 첫 학습에만 넣고,
  // 그 뒤의 학습은 남은 복습만 푼다. 주말에는 밀린 복습이 있을 때만 학습할 수 있다.
  // 같은 세션에서 한 한자가 복습과 다른 유형으로 두 번 나오지 않도록, 복습에 들어간 한자는
  // "다른 유형" 후보에서 뺀다. 대시보드의 숫자도 이 함수로 계산해 실제 세션과 맞춘다.
  function planStudySession(ctx) {
    const newPerDay = ctx.newPerDay ?? NEW_PER_DAY;
    const minNew = ctx.minNew ?? MIN_NEW_PER_SESSION;
    const maxSession = ctx.maxSession ?? MAX_SESSION_SIZE;
    const due = sortReviews(ctx, computeDueItems(ctx));
    const newAlreadyGiven = ctx.newWordsToday > 0;
    if (A.srs.isWeekend(ctx.today) && due.length === 0) return { dueCount: 0, reviews: [], newItems: [] };
    if (newAlreadyGiven) return { dueCount: due.length, reviews: due.slice(0, maxSession), newItems: [] };
    const budget = Math.min(newPerDay, Math.max(minNew, newPerDay - due.length));
    const { fresh, expand } = computeNewCandidates(ctx);

    const firstTotal = Math.min(budget, fresh.length + expand.length);
    const reviewWordIds = new Set(due.slice(0, maxSession - firstTotal).map((it) => it.word.id));
    const expandOk = expand.filter((it) => !reviewWordIds.has(it.word.id));

    const newTotal = Math.min(budget, fresh.length + expandOk.length);
    const split = splitNewSlots(newTotal, fresh.length, expandOk.length);
    const newItems = [...fresh.slice(0, split.fresh), ...expandOk.slice(0, split.expand)];
    return { dueCount: due.length, reviews: due.slice(0, maxSession - newItems.length), newItems };
  }

  // 오늘 이후 처음 오는 학습일(토·일은 건너뛴다). 오늘 학습을 다 한 뒤 "미리 하기"로 당겨올 날이다.
  function nextStudyDay(today) {
    let day = A.srs.addDays(today, 1);
    while (A.srs.isWeekend(day)) day = A.srs.addDays(day, 1);
    return day;
  }

  // 오늘 할 것을 모두 마쳤을 때, 다음 학습일에 하게 될 학습을 미리 구성한다:
  // 그날까지 복습일이 돌아오는 카드(오늘 아직 복습일이 안 된 것 포함)와 그날의 새 문제 몫.
  // 돌려주는 값은 planStudySession과 같고, day(미리 하는 날짜)가 더해진다.
  function planAdvanceSession(ctx) {
    const day = nextStudyDay(ctx.today);
    return { day, ...planStudySession({ ...ctx, today: day, asOf: day, newWordsToday: 0 }) };
  }

  // 오늘 학습을 마친 뒤 밀린 복습을 더 풀 때처럼 신규 없이 복습만 고를 때
  function pickReviews(ctx, dueItems, newCount) {
    return sortReviews(ctx, dueItems).slice(0, Math.max(0, MAX_SESSION_SIZE - newCount));
  }

  A.planner = {
    NEW_PER_DAY,
    MIN_NEW_PER_SESSION,
    MAX_SESSION_SIZE,
    computeDueItems,
    computeNewCandidates,
    splitNewSlots,
    planStudySession,
    planAdvanceSession,
    nextStudyDay,
    pickReviews,
  };
})();
