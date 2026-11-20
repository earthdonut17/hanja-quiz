// hanja*.js 데이터 파일들을 하나로 합쳐 앱이 쓰는 window.HanjaApp.HANJA를 만든다.
(function () {
  const A = window.HanjaApp;
  const SENT = A.SENTENCES || {};
  const STROKES = A.STROKES || {};

  const byId = new Map();
  A.RAW.forEach(([hanja, hun, eum, grade, alt, words]) => {
    byId.set(hanja, {
      id: hanja,
      hanja,
      hun,
      eum,
      grade,
      alt,
      label: `${hun} ${eum}`,
      words: words.map(([h, r, m]) => ({ h, r, m, s: SENT[h] || null })),
      books: [],
    });
  });

  // 교재(「한자가 어휘력이다」)에 나오는 한자: 목록에 있으면 표시만, 없으면 "교재 한자"로 추가
  Object.entries(A.BOOKS || {}).forEach(([book, text]) => {
    text.split("|").forEach((token) => {
      const [hanja, hun, eum] = token.trim().split(" ");
      let h = byId.get(hanja);
      if (!h) {
        h = { id: hanja, hanja, hun, eum, grade: "x", alt: [], label: `${hun} ${eum}`, words: [], books: [] };
        byId.set(hanja, h);
      }
      if (!h.books.includes(book)) h.books.push(book);
    });
  });

  const HANJA = [...byId.values()];
  const catOf = new Map();
  Object.entries(A.CATEGORIES).forEach(([name, chars]) => [...chars].forEach((c) => catOf.set(c, name)));

  // 짝이 있는 한자에 붙인다
  const antonymOf = new Map();
  A.ANTONYM_CHARS.forEach((pair) => {
    const [a, b] = [...pair];
    if (byId.has(a) && byId.has(b)) {
      antonymOf.set(a, b);
      antonymOf.set(b, a);
    }
  });
  const synonymOf = new Map();
  A.SYNONYM_GROUPS.forEach((group) => {
    const present = group.filter((c) => byId.has(c));
    if (present.length < 2) return;
    present.forEach((c) => synonymOf.set(c, present.filter((x) => x !== c)));
  });
  const wordAnto = new Map();
  A.WORD_ANTONYMS.forEach(([w1, w2, o1, o2]) => {
    if (byId.has(o1)) wordAnto.set(o1, [...(wordAnto.get(o1) || []), { word: w1, anti: w2 }]);
    if (byId.has(o2)) wordAnto.set(o2, [...(wordAnto.get(o2) || []), { word: w2, anti: w1 }]);
  });
  const idiomOf = new Map();
  A.IDIOMS.forEach(([h, r, m, owner]) => {
    if (byId.has(owner)) idiomOf.set(owner, [...(idiomOf.get(owner) || []), { h, r, m }]);
  });

  HANJA.forEach((h) => {
    h.category = catOf.get(h.hanja) || null;
    h.antonym = antonymOf.get(h.hanja) || null;
    h.synonyms = synonymOf.get(h.hanja) || null;
    h.wordAntonyms = wordAnto.get(h.hanja) || [];
    h.idioms = idiomOf.get(h.hanja) || [];
    h.strokes = STROKES[h.hanja] || null;
    h.picture = A.PICTURES[h.hanja] || (A.NUMERALS[h.hanja] ? `count:${A.NUMERALS[h.hanja]}` : null);
    h.sentenceWords = h.words.filter((w) => w.s);
  });

  A.HANJA = HANJA;
  A.HANJA_BY_ID = byId;
  A.GRADE_ORDER = Object.keys(A.GRADE_INFO).sort((a, b) => A.GRADE_INFO[a].order - A.GRADE_INFO[b].order);
  A.EXAM_GRADES = A.GRADE_ORDER.filter((g) => g !== "x");

  // 급수 시험 범위: 그 급수까지의 신출 한자를 모두 합친 것 (상위 급수는 하위 급수를 포함한다)
  A.poolForGrade = (grade) => {
    const limit = A.GRADE_INFO[grade].order;
    return HANJA.filter((h) => h.grade !== "x" && A.GRADE_INFO[h.grade].order <= limit);
  };
})();
