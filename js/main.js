const A = window.HanjaApp;
const { HANJA, GRADE_INFO, GRADE_ORDER, EXAM_GRADES } = A;
const store = A.store;
const { newCard, recordAnswer, isDue, dueDate, isWeekend, isMastered, INTERVAL_DAYS } = A.srs;
const { buildQuestion, checkAnswer, shuffle, typesFor, hasType, QUESTION_TYPES, BASIC_TYPES, CORE_TYPES, CIRCLED, TYPES } = A.quiz;

const FREE_PRACTICE_SIZE = 10;
// 오늘의 학습 구성 규칙(하루 새 문제 수, 한 번에 푸는 수 등)은 planner.js에 있다
const { NEW_PER_DAY, MIN_NEW_PER_SESSION, MAX_SESSION_SIZE } = A.planner;
const DEFAULT_SCOPE = ["8", "7"];
const EMOJIS = ["🐶", "🐱", "🐰", "🐻", "🦊", "🐼", "🦁", "🐸", "🐵", "🐯", "🦄", "🐧"];
// 오늘의 학습(복습 일정)은 핵심 유형만 다룬다. 나머지 유형은 자유 연습과 모의고사에서 나오고, 복습 일정에는 넣지 않는다.
const { studyTypesFor, MASTER_LEVEL } = A.progression;
const STUDY_TYPES = new Set(CORE_TYPES);
const STAT_TYPES = CORE_TYPES;

const el = (id) => document.getElementById(id);
const gradeLabel = (g) => (GRADE_INFO[g] ? GRADE_INFO[g].label : `${g}급`);

const screens = {
  users: el("screen-users"),
  dashboard: el("screen-dashboard"),
  quiz: el("screen-quiz"),
  result: el("screen-result"),
  stats: el("screen-stats"),
  list: el("screen-list"),
  mock: el("screen-mock"),
  help: el("screen-help"),
};

let state = {
  user: null,
  progress: {},
  stats: {},
  scope: DEFAULT_SCOPE, // 사용자가 고른 급수 (단계별 해금을 켜면 교재 한자 선택에만 쓴다)
  progression: { enabled: true, titles: {} }, // 급수 마스터 호칭과 단계별 해금 설정
  grades: [], // 지금 공부하는 급수
  words: [], // 지금 공부하는 한자
  session: [],
  sessionItems: [],
  screen: "users",
  screenBeforeHelp: "users",
  mode: "study", // "study" | "exam"(모의고사)
  reviewMode: false,
  index: 0,
  answered: false,
  pending: null, // 모의고사에서 고른(아직 제출 전) 보기
  examGrade: null,
  examAnswers: [],
  result: { correct: 0, wrong: 0, wrongWords: [] },
  selectedEmoji: EMOJIS[0],
};

const wordsById = new Map(HANJA.map((h) => [h.id, h]));

function showScreen(name) {
  state.screen = name;
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  document.body.classList.toggle("quiz-mode", name === "quiz");
  el("btn-switch-user").classList.toggle("hidden", name !== "dashboard" && name !== "stats");
  el("btn-help").classList.toggle("hidden", name === "quiz" || name === "help");
  window.scrollTo(0, 0);
}

function openHelp() {
  state.screenBeforeHelp = state.screen;
  showScreen("help");
}

// 제목을 누르면 어디서든 첫 화면으로. 문제를 풀던 중이면 먼저 확인하고,
// 이번 세션에서 아직 풀지 않은 새 문제만큼 오늘의 새 문제 한도를 돌려준다.
function goHome() {
  if (state.screen === "quiz") {
    if (state.mode === "exam") {
      if (!confirm("모의고사를 그만두고 처음 화면으로 갈까요?\n지금까지 고른 답은 저장되지 않아요.")) return;
    } else {
      if (!confirm("학습을 그만두고 처음 화면으로 갈까요?\n지금까지 푼 문제는 저장돼요.")) return;
      const firstUnanswered = state.answered ? state.index + 1 : state.index;
      const unusedNew = state.sessionItems.slice(firstUnanswered).filter((it) => it.isNew).length;
      if (unusedNew && !state.reviewMode) {
        state.stats.newWordsToday = Math.max(0, state.stats.newWordsToday - unusedNew);
        store.saveStats(state.user.id, state.stats);
      }
    }
  }
  state.reviewMode = false;
  state.mode = "study";
  renderUserList();
  showScreen("users");
}

function deleteCurrentUser() {
  const { id, name } = state.user;
  if (!confirm(`"${name}" 프로필과 모든 학습 기록을 삭제할까요?\n\n삭제하면 되돌릴 수 없어요. 필요하면 먼저 첫 화면의 "기록 내보내기"로 백업하세요.`)) {
    return;
  }
  store.deleteUser(id);
  state.user = null;
  renderUserList();
  showScreen("users");
}

// ---------- 사용자 선택 ----------

function renderUserList() {
  const list = el("user-list");
  list.innerHTML = "";
  store.getUsers().forEach((u) => {
    const card = document.createElement("div");
    card.className = "user-card";
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = u.avatar || EMOJIS[0];
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = u.name;
    card.append(avatar, name);
    card.addEventListener("click", () => selectUser(u.id));
    list.appendChild(card);
  });
}

function renderEmojiPicker() {
  const picker = el("emoji-picker");
  picker.innerHTML = "";
  EMOJIS.forEach((e) => {
    const span = document.createElement("span");
    span.textContent = e;
    if (e === state.selectedEmoji) span.classList.add("selected");
    span.addEventListener("click", () => {
      state.selectedEmoji = e;
      renderEmojiPicker();
    });
    picker.appendChild(span);
  });
}

function selectUser(userId) {
  const user = store.getUsers().find((u) => u.id === userId);
  if (!user) return;
  state.user = user;
  state.progress = store.getProgress(userId);
  state.stats = store.getStats(userId);
  state.progression = store.getProgression(userId);
  const saved = store.getScope(userId);
  const valid = saved ? saved.filter((g) => GRADE_ORDER.includes(g)) : [];
  state.scope = GRADE_ORDER.filter((g) => (valid.length ? valid : DEFAULT_SCOPE).includes(g));
  checkTitles(); // 이미 마스터한 급수가 있으면 호칭을 준다
  refreshWords();
  renderDashboard();
  showScreen("dashboard");
}

// 공부할 급수: 단계별 해금을 켜면 지금 열려 있는 급수(+고르면 교재 한자), 끄면 직접 고른 급수
function studyGrades() {
  if (!state.progression.enabled) return state.scope;
  const open = A.progression.unlockedGrades(state.progression.titles);
  return state.scope.includes("x") ? [...open, "x"] : open;
}

function refreshWords() {
  const grades = studyGrades();
  state.grades = GRADE_ORDER.filter((g) => grades.includes(g));
  state.words = HANJA.filter((h) => state.grades.includes(h.grade));
}

// 새로 마스터한 급수에 호칭을 주고, 이번에 새로 받은 급수 목록을 돌려준다(해금이 바뀌면 공부 범위도 갱신)
function checkTitles() {
  const earned = A.progression.awardTitles(state.progression.titles, state.progress, store.todayStr());
  if (earned.length) {
    store.saveProgression(state.user.id, state.progression);
    refreshWords();
  }
  return earned;
}

// ---------- 공부할 범위 · 급수 마스터 단계 ----------

function renderScopeChips() {
  const box = el("scope-chips");
  box.innerHTML = "";
  const { enabled, titles } = state.progression;
  const open = new Set(A.progression.unlockedGrades(titles));
  GRADE_ORDER.forEach((g) => {
    const count = HANJA.filter((h) => h.grade === g).length;
    const chip = document.createElement("button");
    chip.className = "scope-chip";
    if (g === "x" || !enabled) {
      chip.classList.toggle("on", state.scope.includes(g));
      chip.innerHTML = `${gradeLabel(g)} <small>${count}자</small>`;
    } else if (titles[g]) {
      chip.className = "scope-chip on title";
      chip.innerHTML = `🏅 ${gradeLabel(g)} 마스터`;
    } else if (open.has(g)) {
      const { done, total } = A.progression.gradeStatus(g, state.progress);
      chip.className = "scope-chip on current";
      chip.innerHTML = `${gradeLabel(g)} <small>${done}/${total}</small>`;
    } else {
      chip.className = "scope-chip locked";
      chip.innerHTML = `🔒 ${gradeLabel(g)}`;
      chip.disabled = true;
    }
    chip.addEventListener("click", () => toggleGrade(g));
    box.appendChild(chip);
  });

  const note = el("ladder-note");
  if (!enabled) {
    note.textContent = "단계별 해금이 꺼져 있어요. 공부할 급수를 직접 골라요.";
  } else {
    const current = GRADE_ORDER.filter((g) => g !== "x" && open.has(g) && !titles[g])[0];
    if (!current) {
      note.textContent = "🎉 8급부터 5급까지 모두 마스터했어요!";
    } else {
      const { done, total } = A.progression.gradeStatus(current, state.progress);
      const next = A.EXAM_GRADES[A.EXAM_GRADES.indexOf(current) + 1];
      note.textContent =
        `🎯 ${gradeLabel(current)} 한자 ${total}자가 모두 복습 레벨 ${MASTER_LEVEL} 이상이 되면 ${gradeLabel(current)} 마스터! (지금 ${done}/${total}자)` +
        (next ? ` 마스터하면 ${gradeLabel(next)} 한자가 열려요.` : "");
    }
  }
  el("btn-toggle-progression").textContent = enabled ? "단계별 해금 끄기" : "단계별 해금 켜기";
}

function toggleGrade(g) {
  if (state.progression.enabled && g !== "x") return; // 열린 급수는 자동으로 공부 범위에 들어간다
  const next = state.scope.includes(g) ? state.scope.filter((x) => x !== g) : [...state.scope, g];
  if (!state.progression.enabled && !next.length) return; // 직접 고르는 모드에서는 최소 한 가지는 골라야 한다
  state.scope = GRADE_ORDER.filter((x) => next.includes(x));
  store.saveScope(state.user.id, state.scope);
  refreshWords();
  renderDashboard();
}

function toggleProgression() {
  const turningOff = state.progression.enabled;
  if (turningOff) {
    if (!confirm("단계별 해금을 끌까요?\n지금 열려 있는 급수를 그대로 공부 범위로 두고, 앞으로는 급수를 직접 고를 수 있어요.")) return;
    state.scope = [...state.grades]; // 끄는 순간 공부 범위가 바뀌지 않게 지금 범위를 그대로 둔다
    store.saveScope(state.user.id, state.scope);
  }
  state.progression.enabled = !turningOff;
  store.saveProgression(state.user.id, state.progression);
  refreshWords();
  renderDashboard();
}

// ---------- 대시보드 ----------

// 오늘의 학습 구성은 planner.js가 정한다. 화면의 값(공부할 범위, 진도, 오늘 낸 새 문제 수)만 넘겨 준다.
const planCtx = () => ({
  words: state.words,
  progress: state.progress,
  newWordsToday: state.stats.newWordsToday,
  today: store.todayStr(),
  typesFor: studyTypesFor, // 오늘의 학습은 핵심 유형만
});
const computeDueItems = () => A.planner.computeDueItems(planCtx());
const planStudySession = () => A.planner.planStudySession(planCtx());
const pickReviews = (dueItems, newCount) => A.planner.pickReviews(planCtx(), dueItems, newCount);

// "완전히 외운 한자": 그 한자에 나오는 핵심 유형이 모두 최고 레벨
function isWordMastered(wordId) {
  const rec = state.progress[wordId];
  const word = wordsById.get(wordId);
  if (!rec || !word) return false;
  const core = CORE_TYPES.filter((t) => hasType(word, t));
  return core.every((t) => rec[t] && isMastered(rec[t]));
}

function renderDashboard() {
  el("dash-avatar").textContent = state.user.avatar;
  el("dash-name").textContent = `${state.user.name}님`;
  const top = A.progression.highestTitle(state.progression.titles);
  el("dash-title").textContent = top ? `🏅 ${gradeLabel(top)} 마스터` : `🌱 ${gradeLabel(A.EXAM_GRADES[0])} 마스터에 도전 중`;
  renderScopeChips();

  const learned = state.words.filter((w) => state.progress[w.id]).length;
  const plan = planStudySession();
  const due = plan.dueCount;
  const newAvail = plan.newItems.length;
  const reviewToday = plan.reviews.length;

  el("stat-learned").textContent = `${learned}/${state.words.length}`;
  el("stat-due").textContent = due;
  el("stat-new").textContent = newAvail;
  el("stat-streak").textContent = `${state.stats.streak || 0}🔥`;

  const nothingToStudy = due === 0 && newAvail === 0;
  const emptyMsg = el("dash-empty-msg");
  emptyMsg.classList.toggle("hidden", !nothingToStudy);
  emptyMsg.textContent = state.stats.newWordsToday > 0
    ? "오늘 학습을 모두 마쳤어요! 내일 또 만나요. 자유 연습과 모의고사는 언제든 할 수 있어요."
    : isWeekend(store.todayStr())
    ? "주말에는 밀린 복습이 있을 때만 학습할 수 있어요. 오늘은 푹 쉬거나 자유 연습을 해 볼까요?"
    : "오늘 복습할 문제가 없어요! 자유 연습으로 더 배워볼까요?";
  el("btn-start-study").disabled = nothingToStudy;

  const backlog = el("dash-backlog-msg");
  backlog.classList.toggle("hidden", due <= reviewToday);
  backlog.textContent = `밀린 복습이 모두 ${due}개예요. 학습을 마친 뒤 "남은 복습 더 하기"로 ${MAX_SESSION_SIZE}개씩 이어서 풀 수 있어요.`;
}

// ---------- 한자 목록 ----------

function hanjaStatus(h) {
  const rec = state.progress[h.id];
  if (!rec) return "";
  return isWordMastered(h.id) ? "🟢" : "🟡";
}

function renderHanjaList() {
  const root = el("hanja-list");
  root.innerHTML = "";

  const detail = document.createElement("div");
  detail.className = "hanja-detail";
  root.appendChild(detail);

  const showDetail = (h) => {
    detail.innerHTML = "";
    const big = document.createElement("div");
    big.className = "big";
    big.textContent = h.hanja;
    const info = document.createElement("div");
    info.className = "info";
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = h.label;
    const tag = document.createElement("span");
    tag.className = "grade-tag";
    tag.textContent = gradeLabel(h.grade);
    label.appendChild(tag);
    info.appendChild(label);
    if (h.strokes && h.grade !== "x") {
      const stroke = document.createElement("div");
      stroke.className = "hanja-note";
      stroke.textContent = `총 ${h.strokes}획${h.alt.length ? ` · 다른 음: ${h.alt.join(", ")}` : ""}`;
      info.appendChild(stroke);
    }
    if (h.words.length) {
      const ul = document.createElement("ul");
      h.words.forEach((w) => {
        const li = document.createElement("li");
        const b = document.createElement("b");
        b.textContent = w.h;
        li.append(b, ` (${w.r}) ${w.m}`);
        ul.appendChild(li);
      });
      info.appendChild(ul);
    } else {
      const none = document.createElement("div");
      none.className = "hanja-note";
      none.textContent = "교재에서 가져온 한자라서 아직 한자어 예시가 없어요.";
      info.appendChild(none);
    }
    h.books.forEach((book) => {
      const t = document.createElement("span");
      t.className = "book-tag";
      t.textContent = `📘 ${book}`;
      info.appendChild(t);
    });
    detail.append(big, info);
    root.querySelectorAll(".hanja-cell").forEach((c) => c.classList.toggle("selected", c.dataset.id === h.id));
  };

  const hint = document.createElement("div");
  hint.className = "empty";
  hint.textContent = "아래에서 한자를 눌러 보세요";
  detail.appendChild(hint);

  state.grades.forEach((g) => {
    const group = document.createElement("div");
    group.className = "hanja-group";
    const title = document.createElement("h3");
    const items = state.words.filter((h) => h.grade === g);
    title.textContent = `${gradeLabel(g)} · ${items.length}자`;
    const grid = document.createElement("div");
    grid.className = "hanja-grid";
    items.forEach((h) => {
      const cell = document.createElement("button");
      cell.className = "hanja-cell";
      cell.dataset.id = h.id;
      const dot = hanjaStatus(h);
      if (dot) {
        const d = document.createElement("span");
        d.className = "dot";
        d.textContent = dot;
        cell.appendChild(d);
      }
      if (h.books.length && h.grade !== "x") {
        const b = document.createElement("span");
        b.className = "book-dot";
        b.textContent = "📘";
        cell.appendChild(b);
      }
      const hs = document.createElement("span");
      hs.className = "h";
      hs.textContent = h.hanja;
      const ls = document.createElement("span");
      ls.className = "l";
      ls.textContent = h.label;
      cell.append(hs, ls);
      cell.addEventListener("click", () => showDetail(h));
      grid.appendChild(cell);
    });
    group.append(title, grid);
    root.appendChild(group);
  });
}

// ---------- 통계 ----------

function renderStats() {
  el("stats-avatar").textContent = state.user.avatar;
  el("stats-name").textContent = `${state.user.name}님의 통계`;

  const startedCount = state.words.filter((w) => state.progress[w.id]).length;
  const masteredCount = state.words.filter((w) => isWordMastered(w.id)).length;
  const accuracy = state.stats.totalAnswered
    ? Math.round((state.stats.totalCorrect / state.stats.totalAnswered) * 100) + "%"
    : "-";

  el("stats-started").textContent = `${startedCount}/${state.words.length}`;
  el("stats-mastered").textContent = masteredCount;
  el("stats-accuracy").textContent = accuracy;
  el("stats-longest-streak").textContent = `${state.stats.longestStreak || 0}🔥`;

  renderTitleStats();
  A.statsView.render({
    todayStr: store.todayStr(),
    words: state.words,
    progress: state.progress,
    stats: state.stats,
    types: STAT_TYPES,
    typesForId: (id) => (wordsById.has(id) ? studyTypesFor(wordsById.get(id)) : BASIC_TYPES),
    hasType: (w, t) => studyTypesFor(w).includes(t),
    maxLevel: INTERVAL_DAYS.length - 1,
    dailyCap: MAX_SESSION_SIZE,
    dueDate,
    isMastered,
    gradeLabel,
  });
}

// 통계 화면의 "급수 마스터" 기록
function renderTitleStats() {
  const box = el("stats-titles");
  box.innerHTML = "";
  const { titles } = state.progression;
  A.EXAM_GRADES.forEach((g) => {
    const { done, total } = A.progression.gradeStatus(g, state.progress);
    const row = makeEl("div", "title-row");
    row.append(
      makeEl("span", "title-name", titles[g] ? `🏅 ${gradeLabel(g)} 마스터` : `${gradeLabel(g)}`),
      makeEl("span", "title-meta", titles[g] ? `${titles[g]} 달성` : `레벨 ${MASTER_LEVEL} 이상 ${done}/${total}자`)
    );
    box.appendChild(row);
  });
}

// ---------- 세션 만들기 ----------

function buildStudyItems() {
  const plan = planStudySession();
  const newItems = plan.newItems.map((it) => ({ ...it, isNew: true }));
  if (newItems.length) {
    state.stats.newWordsToday += newItems.length;
    store.saveStats(state.user.id, state.stats);
  }
  return shuffle([...plan.reviews, ...newItems]);
}

function buildFreePracticeItems() {
  return shuffle(state.words)
    .slice(0, FREE_PRACTICE_SIZE)
    .map((w) => {
      const types = typesFor(w);
      return { word: w, type: types[Math.floor(Math.random() * types.length)] };
    });
}

// 오늘 학습을 마친 뒤 밀린 복습을 더 풀고 싶을 때: 새 문제 없이 복습만 (오래 밀린 것부터 고르고 순서는 섞는다)
function buildMoreReviewItems() {
  return shuffle(pickReviews(computeDueItems(), 0));
}

function beginSession(items) {
  state.mode = "study";
  state.sessionItems = items;
  state.session = items.map(({ word, type }) => buildQuestion(word, state.words, type));
  state.index = 0;
  state.result = { correct: 0, wrong: 0, wrongWords: [] };
  showScreen("quiz");
  renderQuestion();
}

// mode: "study"(오늘의 학습) | "free"(자유 연습) | "review"(남은 복습 더 하기)
function startSession(mode) {
  const builders = { study: buildStudyItems, free: buildFreePracticeItems, review: buildMoreReviewItems };
  const items = builders[mode]();
  if (items.length === 0) return;

  state.stats = store.recordStudyDay(state.stats);
  store.saveStats(state.user.id, state.stats);
  state.reviewMode = false;
  beginSession(items);
}

// 복습 주기와 무관하게, 오늘 틀린 문제만 모아서 다시 풀어보는 보너스 라운드.
// 정답 기록·복습 일정·통계에는 전혀 반영되지 않는다.
function startWrongReview() {
  const items = shuffle(state.stats.wrongToday || [])
    .map(({ wordId, type }) => ({ word: wordsById.get(wordId), type }))
    .filter((it) => it.word);
  if (!items.length) return;
  state.reviewMode = true;
  beginSession(items);
}

// ---------- 모의고사 ----------

function renderMockList() {
  const list = el("mock-list");
  list.innerHTML = "";
  const best = {};
  (state.stats.mockLog || []).forEach((m) => {
    best[m.grade] = Math.max(best[m.grade] || 0, Math.round((m.correct / m.total) * 100));
  });
  EXAM_GRADES.forEach((g) => {
    const total = A.mock.total(g);
    const range = A.poolForGrade(g).length;
    const card = document.createElement("button");
    card.className = "mock-card";
    const label = document.createElement("span");
    label.className = "g";
    label.textContent = gradeLabel(g);
    const info = document.createElement("span");
    info.className = "info";
    const span = g === EXAM_GRADES[0] ? gradeLabel(g) : `${gradeLabel(EXAM_GRADES[0])}~${gradeLabel(g)}`;
    info.innerHTML = `<b>${total}문항</b><br>출제 범위 ${range}자 (${span})`;
    const bestEl = document.createElement("span");
    bestEl.className = "best";
    bestEl.textContent = best[g] !== undefined ? `최고 ${best[g]}점` : "";
    card.append(label, info, bestEl);
    card.addEventListener("click", () => startMock(g));
    list.appendChild(card);
  });
}

function startMock(grade) {
  const exam = A.mock.build(grade);
  state.mode = "exam";
  state.reviewMode = false;
  state.examGrade = grade;
  state.session = exam.questions;
  state.sessionItems = [];
  state.examAnswers = [];
  state.index = 0;
  showScreen("quiz");
  renderQuestion();
}

// 모의고사 채점: 제출한 답과 정답을 맞춰 점수와 틀린 문제 해설을 보여 준다. 복습 일정에는 반영하지 않는다.
function finishExam() {
  const total = state.session.length;
  const wrong = [];
  let correct = 0;
  state.session.forEach((q, i) => {
    if (checkAnswer(q, state.examAnswers[i])) correct++;
    else wrong.push({ q, picked: state.examAnswers[i] });
  });
  const pct = Math.round((correct / total) * 100);

  state.stats = store.recordStudyDay(state.stats);
  const log = Array.isArray(state.stats.mockLog) ? state.stats.mockLog : [];
  log.push({ date: store.todayStr(), grade: state.examGrade, correct, total });
  state.stats.mockLog = log.slice(-50);
  for (let i = 0; i < total; i++) recordDailyActivity(state.stats);
  store.saveStats(state.user.id, state.stats);

  el("title-banner").classList.add("hidden");
  el("result-title").textContent = "모의고사 결과 📝";
  const sub = el("result-sub");
  sub.classList.remove("hidden");
  sub.textContent = `${gradeLabel(state.examGrade)} · ${total}문항 · ${pct}점`;
  el("result-correct").textContent = correct;
  el("result-wrong").textContent = wrong.length;

  const list = el("result-wrong-list");
  list.innerHTML = "";
  if (!wrong.length) {
    const perfect = document.createElement("div");
    perfect.className = "result-wrong-item";
    perfect.textContent = "모두 맞혔어요! 🎉";
    list.appendChild(perfect);
  }
  wrong.forEach(({ q, picked }) => {
    const item = makeEl("div", "result-wrong-item exam");
    item.appendChild(makeEl("div", "q-label", `${q.no}번 · ${TYPES[q.type].short}`));
    item.appendChild(makeEl("div", "q-line hanja-font", stemSummary(q)));
    const mine = makeEl("div", "q-line");
    mine.append("내 답: ", makeEl("b", "", picked === undefined || picked === null ? "(고르지 않음)" : picked), " · 정답: ", makeEl("b", "", q.answer));
    item.appendChild(mine);
    item.appendChild(makeEl("div", "q-line", q.explain));
    list.appendChild(item);
  });

  el("btn-review-wrong").classList.add("hidden");
  el("btn-more-review").classList.add("hidden");
  el("btn-mock-again").classList.remove("hidden");
  showScreen("result");
}

// 문제 본문을 한 줄 글로 줄인 것 (틀린 문제 목록용)
function stemSummary(q) {
  const parts = q.stem.map((b) => {
    if (b.k === "sentence") return b.parts.map((p) => p.t).join("");
    if (b.k === "word") return `${b.before}${b.mark}${b.after}`;
    if (b.k === "blanks") return b.items.join(", ");
    if (b.k === "count") return `🍎×${b.n}`;
    return b.t || "";
  });
  // 지시문은 유형마다 같아서 생략하고, ‘한자’가 들어 있는 특별한 지시문만 보여 준다
  const label = q.label === TYPES[q.type].label ? "" : `${q.label} `;
  return `${label}${parts.join(" / ")}`.trim();
}

// ---------- 퀴즈 ----------

function makeEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderQuestion() {
  state.answered = false;
  state.pending = null;
  const q = state.session[state.index];
  const isExam = state.mode === "exam";
  el("progress-text").textContent = `${state.index + 1} / ${state.session.length}`;
  el("progress-fill").style.width = `${(state.index / state.session.length) * 100}%`;
  const badge = el("exam-badge");
  badge.classList.toggle("hidden", !isExam);
  if (isExam) badge.textContent = `${gradeLabel(state.examGrade)} 모의고사`;
  const feedback = el("quiz-feedback");
  feedback.textContent = isExam ? "보기를 고르고 다음으로 넘어가세요. 점수는 끝난 뒤에 알려 줘요." : "";
  feedback.classList.remove("correct", "wrong", "notice");
  feedback.classList.toggle("notice", isExam);
  feedback.style.setProperty("--fit", "1");
  const next = el("btn-next");
  next.disabled = true;
  next.textContent = isExam && state.index === state.session.length - 1 ? "제출하기 ✔" : "다음 문제 ▶";

  const card = el("quiz-card");
  card.innerHTML = "";
  card.appendChild(makeEl("div", "quiz-type-label", isExam ? `${q.no}. ${q.label}` : q.label));
  q.stem.forEach((block) => card.appendChild(renderStemBlock(block)));
  card.appendChild(makeOptionsGrid(q, (value, btn) => (isExam ? pickExamOption(value, btn) : handleAnswer(q, value, btn))));
  fitToBox(card);
  if (isExam) fitToBox(feedback, 0.6);
}

function renderStemBlock(b) {
  if (b.k === "big") return makeEl("div", b.small ? "quiz-hanja small" : "quiz-hanja", b.t);
  if (b.k === "text") return makeEl("div", b.small ? "quiz-prompt small" : "quiz-prompt", b.t);
  if (b.k === "sub") return makeEl("div", "quiz-sentence-meaning", b.t);
  if (b.k === "emoji") return makeEl("div", "quiz-emoji", b.t);
  if (b.k === "count") return makeEl("div", "quiz-count", "🍎".repeat(b.n));
  if (b.k === "word") {
    const word = makeEl("div", "quiz-word");
    word.append(b.before, makeEl("span", "word-mark", b.mark), b.after);
    return word;
  }
  if (b.k === "sentence") {
    const sent = makeEl("div", "quiz-sentence-h");
    b.parts.forEach((p) => {
      if (!p.u) return sent.append(p.t);
      const u = makeEl("u");
      if (!p.hanja) {
        u.textContent = p.t;
      } else {
        const span = makeEl("span", "sent-hanja");
        [...p.t].forEach((ch) => (p.mark && ch === p.mark ? span.appendChild(makeEl("span", "word-mark", ch)) : span.append(ch)));
        u.appendChild(span);
      }
      sent.appendChild(u);
    });
    return sent;
  }
  if (b.k === "blanks") {
    const box = makeEl("div", "quiz-blanks");
    b.items.forEach((pattern) => {
      const item = makeEl("span", "blank-item");
      pattern.split("□").forEach((piece, i, arr) => {
        item.append(piece);
        if (i < arr.length - 1) item.appendChild(makeEl("span", "word-blank", " "));
      });
      box.appendChild(item);
    });
    return box;
  }
  return makeEl("div");
}

// 내용이 상자를 넘치면 --fit 비율을 조금씩 줄여서(글자·여백이 함께 작아짐) 상자 안에 맞춘다.
function fitToBox(box, minScale = 0.45) {
  let scale = 1;
  box.style.setProperty("--fit", "1");
  while (box.scrollHeight > box.clientHeight + 1 && scale > minScale) {
    scale -= 0.05;
    box.style.setProperty("--fit", scale.toFixed(2));
  }
}

function makeOptionsGrid(q, onPick) {
  const oneCol = q.optionClass.includes("option-long");
  const grid = makeEl("div", `options-grid${oneCol ? " one-col" : ""}`);
  q.options.forEach((opt, i) => {
    const btn = makeEl("button", `option-btn ${q.optionClass}`.trim());
    btn.dataset.value = opt.value;
    btn.appendChild(makeEl("span", "opt-no", CIRCLED[i]));
    if (opt.parts) opt.parts.forEach((p) => (p.u ? btn.appendChild(makeEl("u", "", p.t)) : btn.append(p.t)));
    else btn.append(opt.text ?? opt.value);
    btn.addEventListener("click", () => onPick(opt.value, btn));
    grid.appendChild(btn);
  });
  return grid;
}

// 모의고사: 보기를 고르면 표시만 하고, 다음으로 넘어갈 때 답으로 저장한다(넘기기 전에는 바꿀 수 있다).
function pickExamOption(value, btn) {
  state.pending = value;
  btn.parentElement.querySelectorAll(".option-btn").forEach((b) => b.classList.toggle("picked", b === btn));
  el("btn-next").disabled = false;
}

function feedbackText(q, correct) {
  return `${correct ? "정답이에요! " : "아쉬워요! "}${q.explain}`;
}

function handleAnswer(question, value, sourceEl) {
  if (state.answered) return;
  state.answered = true;

  const correct = checkAnswer(question, value);
  A.sound.play(correct ? "correct" : "wrong");

  // 복습 모드(오늘 틀린 문제 다시 풀기)가 아닐 때만 결과를 기록한다.
  if (!state.reviewMode) {
    const wordId = question.word.id;
    const type = question.type;
    // 복습 일정(카드)은 오늘의 학습 유형(핵심 유형)만 관리한다. 다른 유형은 연습으로만 센다.
    if (STUDY_TYPES.has(type)) {
      const rec = state.progress[wordId] || {};
      const card = rec[type] || newCard();
      rec[type] = recordAnswer(card, correct);
      state.progress[wordId] = rec;
      store.saveProgress(state.user.id, state.progress);
    }

    state.stats.totalAnswered = (state.stats.totalAnswered || 0) + 1;
    if (correct) state.stats.totalCorrect = (state.stats.totalCorrect || 0) + 1;

    const wrongToday = state.stats.wrongToday || [];
    const idx = wrongToday.findIndex((w) => w.wordId === wordId && w.type === type);
    if (correct) {
      if (idx !== -1) wrongToday.splice(idx, 1);
    } else if (idx === -1) {
      wrongToday.push({ wordId, type });
    }
    state.stats.wrongToday = wrongToday;

    recordDailyActivity(state.stats);
    store.saveStats(state.user.id, state.stats);
  }

  if (correct) {
    state.result.correct++;
  } else {
    state.result.wrong++;
    state.result.wrongWords.push(question.word);
  }

  const grid = sourceEl.parentElement;
  [...grid.children].forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.value === question.answer) btn.classList.add("correct");
    else if (btn === sourceEl) btn.classList.add("wrong");
  });
  if (question.type === "common_char") {
    el("quiz-card").querySelectorAll(".word-blank").forEach((blank) => {
      blank.textContent = question.answer;
      blank.classList.add("filled");
    });
  }

  const feedback = el("quiz-feedback");
  feedback.classList.remove("correct", "wrong", "notice");
  feedback.classList.add(correct ? "correct" : "wrong");
  feedback.textContent = feedbackText(question, correct);
  fitToBox(feedback, 0.6);

  el("btn-next").disabled = false;
}

// 날짜별로 푼 문제 수를 남긴다(통계의 학습 달력용). 1년 조금 넘게만 보관한다.
const DAILY_LOG_KEEP_DAYS = 400;

function recordDailyActivity(stats) {
  const today = store.todayStr();
  const log = stats.dailyLog && typeof stats.dailyLog === "object" ? stats.dailyLog : {};
  log[today] = (Number(log[today]) || 0) + 1;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAILY_LOG_KEEP_DAYS);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  Object.keys(log).forEach((day) => {
    if (day < cutoffStr) delete log[day];
  });
  stats.dailyLog = log;
  if (!stats.dailyLogStart) stats.dailyLogStart = today;
}

function nextQuestion() {
  if (state.mode === "exam") {
    state.examAnswers[state.index] = state.pending;
    state.pending = null;
  }
  state.index++;
  if (state.index >= state.session.length) {
    if (state.mode === "exam") finishExam();
    else finishSession();
  } else {
    renderQuestion();
  }
}

function finishSession() {
  el("result-title").textContent = "학습 완료! 🎉";
  el("result-sub").classList.add("hidden");
  el("btn-mock-again").classList.add("hidden");
  el("result-correct").textContent = state.result.correct;
  el("result-wrong").textContent = state.result.wrong;
  const list = el("result-wrong-list");
  list.innerHTML = "";
  const shown = new Set();
  state.result.wrongWords.forEach((w) => {
    if (shown.has(w.id)) return;
    shown.add(w.id);
    const item = makeEl("div", "result-wrong-item");
    item.append(makeEl("span", "en hanja-font", w.hanja), makeEl("span", "", w.label));
    list.appendChild(item);
  });
  el("btn-review-wrong").classList.toggle("hidden", !(state.stats.wrongToday || []).length);

  // 급수를 마스터했는지 확인하고, 새로 호칭을 받았으면 축하한다
  const earned = checkTitles();
  const banner = el("title-banner");
  banner.classList.toggle("hidden", !earned.length);
  if (earned.length) {
    const open = A.progression.unlockedGrades(state.progression.titles);
    const newest = open[open.length - 1];
    const tail = !state.progression.enabled
      ? ""
      : state.progression.titles[newest]
      ? " 8급부터 5급까지 모두 마스터했어요! 🎉"
      : ` 이제 ${gradeLabel(newest)} 한자가 함께 나와요.`;
    banner.textContent = `🏅 ${earned.map(gradeLabel).join("·")} 마스터가 되었어요!${tail}`;
    setTimeout(() => A.sound.play("title"), 350); // 마지막 문제 소리가 끝난 뒤에 울린다
  }

  const remaining = computeDueItems().length;
  const moreBtn = el("btn-more-review");
  moreBtn.classList.toggle("hidden", remaining === 0);
  moreBtn.textContent =
    remaining > MAX_SESSION_SIZE
      ? `📚 복습 ${MAX_SESSION_SIZE}개 더 하기 (남은 복습 ${remaining}개)`
      : `📚 남은 복습 ${remaining}개 더 하기`;

  showScreen("result");
}

// ---------- 기록 내보내기 / 가져오기 ----------

function exportRecords() {
  const data = store.exportAll();
  if (!data.users.length) {
    alert("내보낼 기록이 없어요.");
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `한자-기록-${store.todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importRecords(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    alert("파일을 읽을 수 없어요. 이 앱에서 내보낸 .json 파일인지 확인해 주세요.");
    return;
  }
  const names = Array.isArray(data?.users) ? data.users.map((u) => u?.name).filter(Boolean).join(", ") : "";
  if (!confirm(`다음 사용자의 기록을 가져올게요: ${names || "(없음)"}\n\n같은 사용자가 이미 있으면 파일의 기록으로 바뀌어요. 계속할까요?`)) {
    return;
  }
  try {
    const count = store.importAll(data);
    renderUserList();
    alert(`${count}명의 기록을 가져왔어요.`);
  } catch (e) {
    alert(e.message);
  }
}

// ---------- 이벤트 바인딩 ----------

function renderHelpDetails() {
  const exam = HANJA.filter((h) => h.grade !== "x");
  el("help-word-count").textContent = exam.length;
  el("help-extra-count").textContent = HANJA.length - exam.length;
  el("help-max-session").textContent = MAX_SESSION_SIZE;
  el("help-new-per-day").textContent = NEW_PER_DAY;
  el("help-min-new").textContent = MIN_NEW_PER_SESSION;
  el("help-free-size").textContent = FREE_PRACTICE_SIZE;
  const rows = el("help-level-rows");
  rows.innerHTML = "";
  INTERVAL_DAYS.forEach((days, level) => {
    const tr = document.createElement("tr");
    tr.append(makeEl("td", "", String(level)), makeEl("td", "", days === 1 ? "다음 날" : `${days}일 후`));
    rows.appendChild(tr);
  });
}

function renderSoundButton() {
  const on = A.sound.isEnabled();
  const btn = el("btn-sound");
  btn.textContent = on ? "🔊" : "🔇";
  btn.title = on ? "효과음 끄기" : "효과음 켜기";
  btn.setAttribute("aria-pressed", String(on));
}

function init() {
  store.setValidTypes(QUESTION_TYPES);
  renderSoundButton();
  el("btn-sound").addEventListener("click", () => {
    A.sound.setEnabled(!A.sound.isEnabled());
    renderSoundButton();
    A.sound.play("correct"); // 켰을 때 어떤 소리인지 들려준다(끌 때는 소리가 나지 않는다)
  });
  store.migrateSchemaIfNeeded();
  renderHelpDetails();
  renderUserList();
  showScreen("users");

  el("btn-home").addEventListener("click", goHome);
  el("btn-help").addEventListener("click", openHelp);
  el("btn-back-from-help").addEventListener("click", () => showScreen(state.screenBeforeHelp));
  el("btn-delete-user").addEventListener("click", deleteCurrentUser);

  // 휴대폰을 돌리거나 창 크기가 바뀌면 문제 카드 글자 크기를 다시 맞춘다.
  window.addEventListener("resize", () => {
    if (state.screen !== "quiz") return;
    fitToBox(el("quiz-card"));
    if (el("quiz-feedback").textContent) fitToBox(el("quiz-feedback"), 0.6);
  });

  el("btn-add-user").addEventListener("click", () => {
    state.selectedEmoji = EMOJIS[0];
    renderEmojiPicker();
    el("add-user-form").classList.remove("hidden");
    el("new-user-name").value = "";
    el("new-user-name").focus();
  });
  el("btn-cancel-add").addEventListener("click", () => el("add-user-form").classList.add("hidden"));

  const confirmAdd = () => {
    const name = el("new-user-name").value.trim();
    if (!name) {
      el("new-user-name").focus();
      return;
    }
    const user = store.addUser(name, state.selectedEmoji);
    el("add-user-form").classList.add("hidden");
    renderUserList();
    selectUser(user.id);
  };
  el("btn-confirm-add").addEventListener("click", confirmAdd);
  el("new-user-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) confirmAdd();
  });

  el("btn-switch-user").addEventListener("click", () => {
    renderUserList();
    showScreen("users");
  });

  el("btn-export").addEventListener("click", exportRecords);
  el("btn-import").addEventListener("click", () => el("import-file").click());
  el("import-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) importRecords(file);
  });

  el("btn-toggle-progression").addEventListener("click", toggleProgression);
  el("btn-start-study").addEventListener("click", () => startSession("study"));
  el("btn-free-practice").addEventListener("click", () => startSession("free"));
  el("btn-more-review").addEventListener("click", () => startSession("review"));
  el("btn-next").addEventListener("click", nextQuestion);

  el("btn-review-wrong").addEventListener("click", startWrongReview);
  el("btn-back-dashboard").addEventListener("click", () => {
    state.reviewMode = false;
    state.mode = "study";
    renderDashboard();
    showScreen("dashboard");
  });

  el("btn-mock").addEventListener("click", () => {
    renderMockList();
    showScreen("mock");
  });
  el("btn-back-from-mock").addEventListener("click", () => {
    renderDashboard();
    showScreen("dashboard");
  });
  el("btn-mock-again").addEventListener("click", () => {
    renderMockList();
    showScreen("mock");
  });

  el("btn-view-list").addEventListener("click", () => {
    renderHanjaList();
    showScreen("list");
  });
  el("btn-back-from-list").addEventListener("click", () => {
    renderDashboard();
    showScreen("dashboard");
  });

  el("btn-view-stats").addEventListener("click", () => {
    renderStats();
    showScreen("stats");
  });
  el("btn-back-from-stats").addEventListener("click", () => {
    renderDashboard();
    showScreen("dashboard");
  });
}

init();
