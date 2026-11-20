window.HanjaApp = window.HanjaApp || {};

(function () {
  const USERS_KEY = "hanja_app_users";
  const SCHEMA_VERSION_KEY = "hanja_app_schema_version";
  const CURRENT_SCHEMA_VERSION = 2; // v2: 급수 id가 문자열("8","7","6","5p","5","x"), 기출 양식 유형으로 개편

  const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  const progressKey = (id) => `hanja_app_progress_${id}`;
  const statsKey = (id) => `hanja_app_stats_${id}`;
  const scopeKey = (id) => `hanja_app_scope_${id}`;

  function getUsers() {
    return readJSON(USERS_KEY, []);
  }

  function addUser(name, avatar) {
    const users = getUsers();
    const user = { id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name, avatar, createdAt: todayStr() };
    users.push(user);
    writeJSON(USERS_KEY, users);
    return user;
  }

  function deleteUser(userId) {
    writeJSON(USERS_KEY, getUsers().filter((u) => u.id !== userId));
    [progressKey, statsKey, scopeKey].forEach((k) => localStorage.removeItem(k(userId)));
  }

  // 진도는 한자 하나마다, 문제 유형별로 따로 기록한다: progress[한자][유형] = 카드
  function getProgress(userId) {
    return readJSON(progressKey(userId), {});
  }

  function saveProgress(userId, progress) {
    writeJSON(progressKey(userId), progress);
  }

  // 사용자가 공부하기로 고른 급수 목록(예: ["8", "7"]). 없으면 null.
  // 예전 버전은 숫자([8, 7])로 저장했으므로 문자열로 바꿔서 돌려준다.
  function getScope(userId) {
    const scope = readJSON(scopeKey(userId), null);
    return Array.isArray(scope) ? scope.map(String) : null;
  }

  function saveScope(userId, scope) {
    writeJSON(scopeKey(userId), scope);
  }

  function getStats(userId) {
    const stats = readJSON(statsKey(userId), {
      streak: 0,
      longestStreak: 0,
      lastStudyDate: null,
      totalAnswered: 0,
      totalCorrect: 0,
      newWordsToday: 0,
      newWordsDate: null,
      wrongToday: [],
      wrongTodayDate: null,
      dailyLog: {},
      dailyLogStart: null,
    });
    if (stats.newWordsDate !== todayStr()) {
      stats.newWordsToday = 0;
      stats.newWordsDate = todayStr();
    }
    if (stats.wrongTodayDate !== todayStr()) {
      stats.wrongToday = [];
      stats.wrongTodayDate = todayStr();
    }
    if (!Array.isArray(stats.mockLog)) stats.mockLog = []; // 모의고사 기록 [{date, grade, correct, total}]
    return stats;
  }

  function saveStats(userId, stats) {
    writeJSON(statsKey(userId), stats);
  }

  // 주말은 쉬어도 연속 학습일이 끊기지 않는다: 지난 학습일과 오늘 사이의 날이 모두 토/일이면 이어진다.
  function continuesStreak(lastDate, today) {
    if (!lastDate) return false;
    const [y, m, d] = lastDate.split("-").map(Number);
    const day = new Date(y, m - 1, d + 1);
    for (let i = 0; i < 7; i++) {
      const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      if (dayStr >= today) return true;
      if (day.getDay() !== 0 && day.getDay() !== 6) return false;
      day.setDate(day.getDate() + 1);
    }
    return false;
  }

  function recordStudyDay(stats) {
    const today = todayStr();
    if (stats.lastStudyDate === today) return stats;
    stats.streak = continuesStreak(stats.lastStudyDate, today) ? (stats.streak || 0) + 1 : 1;
    stats.longestStreak = Math.max(stats.longestStreak || 0, stats.streak);
    stats.lastStudyDate = today;
    return stats;
  }

  // 더 이상 없는 문제 유형(예: 음 쓰기)의 기록은 버린다. validTypes는 지금 앱이 내는 유형 목록이다.
  let validTypes = null;
  function setValidTypes(types) {
    validTypes = new Set(types);
  }
  function pruneProgress(progress) {
    if (!validTypes || !isPlainObject(progress)) return progress;
    Object.keys(progress).forEach((id) => {
      const rec = progress[id];
      if (!isPlainObject(rec)) return delete progress[id];
      Object.keys(rec).forEach((type) => !validTypes.has(type) && delete rec[type]);
      if (!Object.keys(rec).length) delete progress[id];
    });
    return progress;
  }
  function pruneStats(stats) {
    if (validTypes && stats && Array.isArray(stats.wrongToday)) {
      stats.wrongToday = stats.wrongToday.filter((w) => w && validTypes.has(w.type));
    }
    return stats;
  }

  function migrateSchemaIfNeeded() {
    const stored = readJSON(SCHEMA_VERSION_KEY, 0);
    if (stored === CURRENT_SCHEMA_VERSION) return;
    getUsers().forEach((u) => {
      writeJSON(progressKey(u.id), pruneProgress(readJSON(progressKey(u.id), {})));
      const stats = readJSON(statsKey(u.id), null);
      if (stats) writeJSON(statsKey(u.id), pruneStats(stats));
      const scope = readJSON(scopeKey(u.id), null);
      if (Array.isArray(scope)) writeJSON(scopeKey(u.id), scope.map(String));
    });
    writeJSON(SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION);
  }

  const EXPORT_APP_ID = "elementary-hanja-quiz";

  function exportAll() {
    return {
      app: EXPORT_APP_ID,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      users: getUsers().map((u) => ({
        ...u,
        progress: readJSON(progressKey(u.id), {}),
        stats: readJSON(statsKey(u.id), null),
        scope: readJSON(scopeKey(u.id), null),
      })),
    };
  }

  // 파일에 담긴 사용자만 추가/덮어쓰고, 파일에 없는 기존 사용자는 그대로 둔다.
  // 쓰기 전에 전체를 먼저 검증해서, 잘못된 파일이면 아무것도 바꾸지 않는다.
  function importAll(data) {
    if (!isPlainObject(data) || data.app !== EXPORT_APP_ID || !Array.isArray(data.users)) {
      throw new Error("이 앱에서 내보낸 기록 파일이 아니에요.");
    }
    if (![1, CURRENT_SCHEMA_VERSION].includes(data.schemaVersion)) {
      throw new Error("지원하지 않는 버전의 기록 파일이에요.");
    }
    const valid = data.users.every(
      (u) =>
        isPlainObject(u) &&
        typeof u.id === "string" && u.id &&
        typeof u.name === "string" &&
        (u.progress === undefined || isPlainObject(u.progress)) &&
        (u.stats === undefined || u.stats === null || isPlainObject(u.stats)) &&
        (u.scope === undefined || u.scope === null || Array.isArray(u.scope))
    );
    if (!valid) throw new Error("기록 파일 내용이 손상되었어요.");

    const users = getUsers();
    data.users.forEach((u) => {
      const entry = { id: u.id, name: u.name, avatar: u.avatar, createdAt: u.createdAt };
      const idx = users.findIndex((x) => x.id === u.id);
      if (idx === -1) users.push(entry);
      else users[idx] = entry;
      writeJSON(progressKey(u.id), pruneProgress(u.progress || {}));
      if (u.stats) writeJSON(statsKey(u.id), pruneStats(u.stats));
      else localStorage.removeItem(statsKey(u.id));
      if (u.scope) writeJSON(scopeKey(u.id), u.scope.map(String));
      else localStorage.removeItem(scopeKey(u.id));
    });
    writeJSON(USERS_KEY, users);
    return data.users.length;
  }

  window.HanjaApp.store = {
    exportAll,
    importAll,
    todayStr,
    getUsers,
    addUser,
    deleteUser,
    getProgress,
    saveProgress,
    getScope,
    saveScope,
    getStats,
    saveStats,
    recordStudyDay,
    setValidTypes,
    migrateSchemaIfNeeded,
  };
})();
