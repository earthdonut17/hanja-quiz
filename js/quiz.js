window.HanjaApp = window.HanjaApp || {};

// 대한검정회 기출 양식(4지선다)에 맞춘 문제 생성기.
// 문제 문장·예문·보기는 모두 이 앱의 데이터에서 새로 만든 것이고, 기출문제를 옮기지 않았다.
//
// 문제 객체: { type, word(문제의 중심 한자), label(문제 지시문), stem(문제 본문 블록들),
//              options(보기), answer(정답 값), answerText, explain, optionClass }
//  - stem 블록: {k:"big"|"text"|"sub"|"emoji"|"count"|"word"|"sentence"|"blanks", ...}
//  - options 항목: {value, text?, parts?}  (parts는 밑줄이 필요한 보기용)
(function () {
  const A = window.HanjaApp;
  const { HANJA, SIMILAR_GROUPS, CATEGORY_LABEL } = A;

  // 문제 유형 정의. short는 통계 표에 쓰는 이름이다.
  const TYPES = {
    meaning_choice: { label: "한자의 훈음으로 바른 것을 고르세요.", short: "훈음 고르기" },
    hanja_choice: { label: "훈음에 알맞은 한자를 고르세요.", short: "한자 고르기" },
    picture_choice: { label: "그림에 알맞은 한자를 고르세요.", short: "그림 한자" },
    word_reading: { label: "한자어를 바르게 읽은 것을 고르세요.", short: "독음 고르기" },
    word_meaning: { label: "한자어의 뜻으로 알맞은 것을 고르세요.", short: "어휘 뜻" },
    word_write: { label: "낱말을 한자로 바르게 쓴 것을 고르세요.", short: "한자어 쓰기" },
    sentence_reading: { label: "밑줄 친 어휘를 바르게 읽은 것을 고르세요.", short: "문장 독음" },
    sentence_write: { label: "밑줄 친 부분을 한자로 바르게 쓴 것을 고르세요.", short: "문장 한자" },
    sentence_hun: { label: "밑줄 친 한자의 훈음으로 알맞은 것을 고르세요.", short: "문장 훈음" },
    wrong_word: { label: "밑줄 친 부분의 한자가 잘못 쓰인 것을 고르세요.", short: "잘못 쓴 한자" },
    antonym_char: { label: "반의자(뜻이 반대인 한자)를 고르세요.", short: "반의자" },
    synonym_char: { label: "유의자(뜻이 비슷한 한자)를 고르세요.", short: "유의자" },
    antonym_word: { label: "반의어(뜻이 반대인 어휘)를 고르세요.", short: "반의어" },
    category_pick: { label: "알맞은 답을 고르세요.", short: "한자 갈래" },
    stroke_count: { label: "한자의 총획이 바르지 않은 것을 고르세요.", short: "총획" },
    idiom_meaning: { label: "사자성어의 뜻으로 알맞은 것을 고르세요.", short: "사자성어" },
    common_char: { label: "□ 안에 공통으로 들어갈 한자를 고르세요.", short: "공통 한자" },
    moral: { label: "생활 속 바른 행동을 고르세요.", short: "생활 예절" },
  };
  const QUESTION_TYPES = Object.keys(TYPES);
  // 처음 보는 한자에게 먼저 내는 기본 유형, 그리고 "외웠다"의 기준이 되는 핵심 유형
  const BASIC_TYPES = ["meaning_choice", "hanja_choice"];
  const CORE_TYPES = ["meaning_choice", "hanja_choice", "word_reading", "word_write", "sentence_write"];

  const ALL_WORDS = new Map(); // 한자어 → 독음 (실제로 있는 낱말은 오답으로 만든 가짜 낱말에서 걸러낸다)
  HANJA.forEach((h) => h.words.forEach((w) => ALL_WORDS.set(w.h, w.r)));
  A.IDIOMS.forEach(([h, r]) => ALL_WORDS.set(h, r));

  const CIRCLED = ["①", "②", "③", "④"];
  // 받침 유무에 따라 을/를을 고른다 (마지막 한글 글자 기준)
  const eulReul = (word) => {
    const m = word.match(/[가-힣](?=[^가-힣]*$)/);
    return m && (m[0].charCodeAt(0) - 0xac00) % 28 !== 0 ? "을" : "를";
  };
  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- 유형별로 이 한자에 낼 수 있는지 ----------

  const AVAILABLE = {
    meaning_choice: () => true,
    hanja_choice: () => true,
    picture_choice: (h) => !!h.picture && h.grade !== "x",
    word_reading: (h) => h.words.length > 0,
    word_meaning: (h) => h.words.length > 0,
    word_write: (h) => h.words.length > 0,
    sentence_reading: (h) => h.sentenceWords.length > 0,
    sentence_write: (h) => h.sentenceWords.length > 0,
    sentence_hun: (h) => h.sentenceWords.length > 0,
    wrong_word: (h) => h.sentenceWords.length > 0,
    antonym_char: (h) => !!h.antonym,
    synonym_char: (h) => !!h.synonyms,
    antonym_word: (h) => h.wordAntonyms.length > 0,
    category_pick: (h) => !!h.category,
    stroke_count: (h) => !!h.strokes && h.grade !== "x",
    idiom_meaning: (h) => h.idioms.length > 0,
    common_char: (h) => h.words.length >= 3,
    moral: () => false, // 한자와 상관없는 문제라 모의고사에서만 쓴다
  };
  const typesFor = (h) => QUESTION_TYPES.filter((t) => AVAILABLE[t](h));
  const hasType = (h, t) => AVAILABLE[t](h);

  // ---------- 보기를 만드는 도구 ----------

  const similarMap = new Map();
  SIMILAR_GROUPS.forEach((group) =>
    group.forEach((c) => similarMap.set(c, new Set([...(similarMap.get(c) || []), ...group.filter((x) => x !== c)])))
  );

  // 정답 한자 말고 오답 한자 n개: 모양이 비슷한 한자를 먼저(최대 2개), 나머지는 무작위로
  function otherHanja(target, pool, n, exclude = new Set()) {
    const ok = (h) => h.id !== target.id && !exclude.has(h.id);
    const candidates = pool.filter(ok);
    const similar = shuffle(candidates.filter((h) => (similarMap.get(target.id) || new Set()).has(h.id))).slice(0, 2);
    const rest = shuffle(candidates.filter((h) => !similar.includes(h)));
    return [...similar, ...rest].slice(0, n);
  }

  function hanjaOptions(hs) {
    return shuffle(hs).map((h) => ({ value: h.hanja, text: h.hanja }));
  }
  function textOptions(values) {
    return shuffle(values).map((v) => ({ value: v, text: v }));
  }

  // 한자어의 글자 하나를 바꿔 만든 가짜 낱말. 실제 낱말이면 쓰지 않는다.
  function fakeWords(word, pool, n, avoidReading) {
    const chars = [...word.h];
    const used = new Set([word.h]);
    const out = [];
    const poolChars = pool.map((h) => h.hanja);
    for (let tries = 0; tries < 200 && out.length < n; tries++) {
      const copy = [...chars];
      const changes = chars.length >= 2 && Math.random() < 0.35 ? 2 : 1;
      const idxs = shuffle(chars.map((_, i) => i)).slice(0, Math.min(changes, chars.length));
      idxs.forEach((i) => {
        const sim = [...(similarMap.get(chars[i]) || [])].filter((c) => poolChars.includes(c));
        copy[i] = sim.length && Math.random() < 0.5 ? pickOne(sim) : pickOne(poolChars);
      });
      const text = copy.join("");
      if (used.has(text) || ALL_WORDS.has(text) || (avoidReading && ALL_WORDS.get(text) === avoidReading)) continue;
      used.add(text);
      out.push(text);
    }
    return out;
  }

  // 독음에서 한 글자를 바꾸거나 순서를 뒤집어 만든 그럴듯한 오답 독음
  function fakeReadings(word, pool, n) {
    const syllables = [...word.r];
    const eums = [...new Set(pool.flatMap((h) => [h.eum, ...h.alt]))];
    const used = new Set([word.r]);
    const out = [];
    const reversed = [...syllables].reverse().join("");
    if (syllables.length >= 2 && !used.has(reversed) && Math.random() < 0.7) {
      used.add(reversed);
      out.push(reversed);
    }
    for (let tries = 0; tries < 120 && out.length < n; tries++) {
      const copy = [...syllables];
      copy[Math.floor(Math.random() * copy.length)] = pickOne(eums);
      const text = copy.join("");
      if (!used.has(text)) {
        used.add(text);
        out.push(text);
      }
    }
    return out;
  }

  function wordFlag(w, h) {
    const pos = w.h.indexOf(h.hanja);
    return { before: w.h.slice(0, pos), mark: h.hanja, after: w.h.slice(pos + 1) };
  }
  const wordInfo = (w) => `${w.h}(${w.r}): ${w.m}`;

  // 문장 {독음} 자리를 앞·뒤 글로 나눈다
  function splitSentence(w) {
    const m = /^(.*)\{[^}]+\}(.*)$/.exec(w.s);
    return { before: m[1], after: m[2] };
  }

  // ---------- 유형별 문제 만들기 ----------

  function base(type, h, extra) {
    return { type, word: h, label: TYPES[type].label, optionClass: "", ...extra };
  }

  const BUILDERS = {
    meaning_choice(h, pool) {
      const sameEum = shuffle(pool.filter((x) => x.id !== h.id && x.eum === h.eum)).slice(0, 1);
      const others = otherHanja(h, pool, 3, new Set(sameEum.map((x) => x.id)));
      const opts = [h, ...sameEum, ...others].slice(0, 4);
      return base("meaning_choice", h, {
        stem: [{ k: "big", t: h.hanja }],
        options: textOptions(opts.map((x) => x.label)),
        answer: h.label,
        explain: `${h.hanja} = ${h.label}`,
      });
    },

    hanja_choice(h, pool) {
      return base("hanja_choice", h, {
        stem: [{ k: "text", t: h.label }],
        options: hanjaOptions([h, ...otherHanja(h, pool, 3)]),
        answer: h.hanja,
        optionClass: "option-hanja",
        explain: `${h.label} = ${h.hanja}`,
      });
    },

    picture_choice(h, pool) {
      const isCount = h.picture.startsWith("count:");
      const conflict = new Set(A.PICTURE_CONFLICTS.filter((g) => g.includes(h.hanja)).flatMap((g) => [...g]));
      const withPic = pool.filter((x) => x.picture && x.id !== h.id && x.grade !== "x" && !conflict.has(x.hanja));
      const sameKind = withPic.filter((x) => x.picture.startsWith("count:") === isCount);
      const picks = otherHanja(h, sameKind.length >= 3 ? sameKind : withPic, 3);
      if (picks.length < 3) return null;
      const stem = isCount ? [{ k: "count", n: Number(h.picture.slice(6)) }] : [{ k: "emoji", t: h.picture }];
      return base("picture_choice", h, {
        stem,
        options: hanjaOptions([h, ...picks]),
        answer: h.hanja,
        optionClass: "option-hanja",
        explain: `${h.hanja} = ${h.label}`,
      });
    },

    word_reading(h, pool) {
      const w = pickOne(h.words);
      return base("word_reading", h, {
        stem: [{ k: "word", ...wordFlag(w, h) }],
        options: textOptions([w.r, ...fakeReadings(w, pool, 3)]),
        answer: w.r,
        explain: wordInfo(w),
      });
    },

    word_meaning(h, pool) {
      const w = pickOne(h.words);
      const chars = new Set([...w.h]);
      const others = [];
      const seenM = new Set([w.m]);
      pool.forEach((x) =>
        x.words.forEach((o) => {
          if (o.h !== w.h) others.push(o);
        })
      );
      const confusable = shuffle(others.filter((o) => [...o.h].some((c) => chars.has(c))));
      const picks = [];
      for (const o of [...confusable, ...shuffle(others)]) {
        if (picks.length >= 3) break;
        if (seenM.has(o.m) || o.h === w.h) continue;
        seenM.add(o.m);
        picks.push(o);
      }
      if (picks.length < 3) return null;
      return base("word_meaning", h, {
        stem: [{ k: "word", ...wordFlag(w, h) }],
        options: textOptions([w.m, ...picks.map((o) => o.m)]),
        answer: w.m,
        optionClass: "option-long",
        explain: wordInfo(w),
      });
    },

    word_write(h, pool) {
      const w = pickOne(h.words);
      const fakes = fakeWords(w, pool, 3, w.r);
      if (fakes.length < 3) return null;
      return base("word_write", h, {
        stem: [{ k: "text", t: w.r }, { k: "sub", t: w.m }],
        options: textOptions([w.h, ...fakes]),
        answer: w.h,
        optionClass: "option-word",
        explain: wordInfo(w),
      });
    },

    sentence_reading(h, pool) {
      const w = pickOne(h.sentenceWords);
      const { before, after } = splitSentence(w);
      return base("sentence_reading", h, {
        stem: [{ k: "sentence", parts: [{ t: before }, { t: w.h, u: true, hanja: true }, { t: after }] }],
        options: textOptions([w.r, ...fakeReadings(w, pool, 3)]),
        answer: w.r,
        explain: wordInfo(w),
      });
    },

    sentence_write(h, pool) {
      const w = pickOne(h.sentenceWords);
      const { before, after } = splitSentence(w);
      const fakes = fakeWords(w, pool, 3, w.r);
      if (fakes.length < 3) return null;
      return base("sentence_write", h, {
        stem: [{ k: "sentence", parts: [{ t: before }, { t: w.r, u: true }, { t: after }] }],
        options: textOptions([w.h, ...fakes]),
        answer: w.h,
        optionClass: "option-word",
        explain: wordInfo(w),
      });
    },

    sentence_hun(h, pool) {
      const w = pickOne(h.sentenceWords);
      const { before, after } = splitSentence(w);
      const others = otherHanja(h, pool, 3);
      return base("sentence_hun", h, {
        label: `밑줄 친 어휘 속 ‘${h.hanja}’의 훈음으로 알맞은 것을 고르세요.`,
        stem: [{ k: "sentence", parts: [{ t: before }, { t: w.h, u: true, hanja: true, mark: h.hanja }, { t: after }] }],
        options: textOptions([h.label, ...others.map((x) => x.label)]),
        answer: h.label,
        explain: `${h.hanja} = ${h.label} · ${wordInfo(w)}`,
      });
    },

    wrong_word(h, pool) {
      const wrongBase = pickOne(h.sentenceWords);
      const fakes = fakeWords(wrongBase, pool, 1, wrongBase.r);
      if (!fakes.length) return null;
      // 다른 세 줄은 서로 다른 한자어(같은 한자어를 두 번 쓰지 않는다)에서 가져온다
      const usedWords = new Set([wrongBase.h]);
      const otherWords = [];
      for (const x of shuffle(pool.filter((p) => p.id !== h.id && p.sentenceWords.length))) {
        const w = pickOne(x.sentenceWords.filter((sw) => !usedWords.has(sw.h)).concat([]) );
        if (!w) continue;
        usedWords.add(w.h);
        otherWords.push(w);
        if (otherWords.length === 3) break;
      }
      if (otherWords.length < 3) return null;
      const line = (w, hanjaText) => {
        const { before, after } = splitSentence(w);
        return { value: `${before}${w.r}${after} : ${hanjaText}`, parts: [{ t: before }, { t: w.r, u: true }, { t: `${after} : ${hanjaText}` }] };
      };
      const opts = [line(wrongBase, fakes[0]), ...otherWords.map((w) => line(w, w.h))];
      return base("wrong_word", h, {
        stem: [{ k: "sub", t: "문장에서 밑줄 친 말을 한자로 쓴 것입니다." }],
        options: shuffle(opts),
        answer: opts[0].value,
        optionClass: "option-long",
        explain: `바른 한자어는 ${wordInfo(wrongBase)}`,
      });
    },

    antonym_char(h, pool) {
      const target = HANJA.find((x) => x.hanja === h.antonym);
      const exclude = new Set([target.id, h.id, ...(target.synonyms || []), ...(h.synonyms || [])]);
      const others = otherHanja(h, pool, 3, exclude);
      return base("antonym_char", h, {
        label: `‘${h.hanja}’의 반의자(뜻이 반대인 한자)를 고르세요.`,
        stem: [{ k: "big", t: h.hanja }],
        options: hanjaOptions([target, ...others]),
        answer: target.hanja,
        optionClass: "option-hanja",
        explain: `${h.hanja}(${h.label}) ↔ ${target.hanja}(${target.label})`,
      });
    },

    synonym_char(h, pool) {
      const targetId = pickOne(h.synonyms);
      const target = HANJA.find((x) => x.hanja === targetId);
      const exclude = new Set([target.id, h.id, ...h.synonyms]);
      if (h.antonym) exclude.add(h.antonym);
      const others = otherHanja(h, pool, 3, exclude);
      return base("synonym_char", h, {
        label: `‘${h.hanja}’의 유의자(뜻이 비슷한 한자)를 고르세요.`,
        stem: [{ k: "big", t: h.hanja }],
        options: hanjaOptions([target, ...others]),
        answer: target.hanja,
        optionClass: "option-hanja",
        explain: `${h.hanja}(${h.label}) ≈ ${target.hanja}(${target.label})`,
      });
    },

    antonym_word(h, pool) {
      const pair = pickOne(h.wordAntonyms);
      const words = [...new Set(pool.flatMap((x) => x.words.map((w) => w.h)))].filter((w) => w !== pair.word && w !== pair.anti);
      const confusable = words.filter((w) => [...w].some((c) => [...pair.anti].includes(c)));
      const picks = [...new Set([...shuffle(confusable).slice(0, 1), ...shuffle(words)])].slice(0, 3);
      if (picks.length < 3) return null;
      return base("antonym_word", h, {
        label: `‘${pair.word}’의 반의어(뜻이 반대인 어휘)를 고르세요.`,
        stem: [{ k: "big", t: pair.word }],
        options: textOptions([pair.anti, ...picks]),
        answer: pair.anti,
        optionClass: "option-word",
        explain: `${pair.word} ↔ ${pair.anti}`,
      });
    },

    category_pick(h, pool) {
      const cat = h.category;
      const related = { 시간: "계절", 계절: "시간" };
      const inCat = pool.filter((x) => x.category === cat);
      const outsiders = pool.filter((x) => x.category && x.category !== cat && x.category !== related[cat]);
      const name = CATEGORY_LABEL[cat];
      const negative = inCat.length >= 3 && outsiders.length >= 1 && (outsiders.length < 3 || Math.random() < 0.5);
      if (negative) {
        const members = [h, ...shuffle(inCat.filter((x) => x.id !== h.id)).slice(0, 2)];
        const out = pickOne(outsiders);
        return base("category_pick", h, {
          label: `${name}${eulReul(name)} 나타내는 한자가 아닌 것을 고르세요.`,
          stem: [{ k: "sub", t: "네 개 중 하나만 다른 갈래예요." }],
          options: hanjaOptions([...members, out]),
          answer: out.hanja,
          optionClass: "option-hanja",
          explain: `${out.hanja} = ${out.label} · ${name}에 속하지 않아요.`,
        });
      }
      if (outsiders.length < 3) return null;
      return base("category_pick", h, {
        label: `${name}${eulReul(name)} 나타내는 한자를 고르세요.`,
        stem: [{ k: "sub", t: "네 개 중 하나만 이 갈래예요." }],
        options: hanjaOptions([h, ...shuffle(outsiders).slice(0, 3)]),
        answer: h.hanja,
        optionClass: "option-hanja",
        explain: `${h.hanja} = ${h.label} (${name})`,
      });
    },

    stroke_count(h, pool) {
      const withStrokes = pool.filter((x) => x.strokes && x.id !== h.id);
      if (withStrokes.length < 3) return null;
      const others = shuffle(withStrokes).slice(0, 3);
      const wrongIsOwner = Math.random() < 0.6;
      const wrongOne = wrongIsOwner ? h : others[0];
      let wrongN = wrongOne.strokes + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.7 ? 1 : 2);
      if (wrongN < 1 || wrongN === wrongOne.strokes) wrongN = wrongOne.strokes + 1;
      const items = [h, ...others].map((x) => ({ h: x, n: x === wrongOne ? wrongN : x.strokes }));
      const opts = items.map(({ h: x, n }) => ({ value: `${x.hanja}-총${n}획`, text: `${x.hanja}-총${n}획` }));
      const wrongItem = items.find((it) => it.h === wrongOne);
      return base("stroke_count", h, {
        stem: [{ k: "sub", t: "한 개만 틀리게 적었어요." }],
        options: shuffle(opts),
        answer: `${wrongOne.hanja}-총${wrongItem.n}획`,
        explain: `${wrongOne.hanja}의 총획은 ${wrongOne.strokes}획이에요.`,
      });
    },

    idiom_meaning(h) {
      const idiom = pickOne(h.idioms);
      const others = shuffle(A.IDIOMS.filter(([w]) => w !== idiom.h)).slice(0, 3);
      return base("idiom_meaning", h, {
        label: `사자성어 ‘${idiom.h}’의 뜻으로 알맞은 것을 고르세요.`,
        stem: [{ k: "big", t: idiom.h, small: true }],
        options: textOptions([idiom.m, ...others.map((o) => o[2])]),
        answer: idiom.m,
        optionClass: "option-long",
        explain: `${idiom.h}(${idiom.r}): ${idiom.m}`,
      });
    },

    common_char(h, pool) {
      const words = shuffle(h.words).slice(0, 3);
      if (words.length < 3) return null;
      const patterns = words.map((w) => w.h.replace(h.hanja, "□"));
      // 오답 한자를 □에 넣으면 실제 낱말이 되는 경우가 하나라도 있으면 쓰지 않는다
      const fitsAny = (c) => patterns.some((p) => ALL_WORDS.has(p.replace("□", c)));
      const candidates = otherHanja(h, pool, 30).filter((x) => !fitsAny(x.hanja));
      if (candidates.length < 3) return null;
      return base("common_char", h, {
        stem: [{ k: "blanks", items: patterns }],
        options: hanjaOptions([h, ...candidates.slice(0, 3)]),
        answer: h.hanja,
        optionClass: "option-hanja",
        explain: `${words.map((w) => w.h).join(", ")} → ${h.hanja}(${h.label})`,
      });
    },
  };

  // 생활 예절 문제는 한자와 상관없이 시험 마지막 문항에 나온다. used로 이미 낸 문제를 피한다.
  function buildMoral(used = new Set()) {
    const pool = A.MORAL.map((m, i) => ({ m, i })).filter(({ i }) => !used.has(i));
    const { m, i } = pickOne(pool.length ? pool : A.MORAL.map((mm, ii) => ({ m: mm, i: ii })));
    used.add(i);
    return {
      type: "moral",
      word: null,
      label: m.neg ? "바르지 않은 것을 고르세요." : "알맞은 것을 고르세요.",
      stem: [{ k: "text", t: m.q, small: true }],
      options: textOptions([m.a, ...m.w]),
      answer: m.a,
      optionClass: "option-long",
      explain: m.a,
    };
  }

  // forceType이 이 한자에 맞지 않거나 문제를 만들지 못하면 다른 유형을 차례로 시도한다.
  // 그래서 돌려주는 문제의 type이 요청한 유형과 다를 수 있다(기록은 실제 낸 유형으로 남는다).
  function buildQuestion(h, pool, forceType) {
    const order = [];
    if (forceType && hasType(h, forceType)) order.push(forceType);
    shuffle(typesFor(h)).forEach((t) => !order.includes(t) && order.push(t));
    ["meaning_choice", "hanja_choice"].forEach((t) => !order.includes(t) && order.push(t));
    for (const t of order) {
      const q = BUILDERS[t](h, pool.length >= 4 ? pool : HANJA);
      if (q) return q;
    }
    return BUILDERS.meaning_choice(h, HANJA);
  }

  function checkAnswer(question, value) {
    return value === question.answer;
  }

  A.quiz = {
    TYPES,
    shuffle,
    pickOne,
    buildQuestion,
    buildMoral,
    BUILDERS,
    checkAnswer,
    typesFor,
    hasType,
    QUESTION_TYPES,
    BASIC_TYPES,
    CORE_TYPES,
    CIRCLED,
  };
})();
