window.HanjaApp = window.HanjaApp || {};

// 모의고사: 실제 시험(가형)과 같은 문항 수와 순서로, 이 앱의 데이터에서 새로 문제를 만든다.
// 기출문제의 문항·보기를 쓰지 않고 문제 "양식"(문항 수, 유형 순서, 4지선다)만 따른다.
//  - 8급·7급은 25문항, 6급·준5급·5급은 50문항이다.
//  - 출제 범위는 그 급수까지의 신출 한자를 모두 합친 것이다(상위 급수는 하위 급수를 포함한다).
(function () {
  const A = window.HanjaApp;
  const { quiz } = A;

  // [문제 유형, 문항 수]를 시험 순서대로
  const BLUEPRINT = {
    "8": [
      ["picture_choice", 3], ["meaning_choice", 5], ["hanja_choice", 10], ["word_reading", 2],
      ["word_write", 2], ["sentence_reading", 2], ["sentence_write", 1],
    ],
    "7": [
      ["picture_choice", 1], ["meaning_choice", 7], ["hanja_choice", 10], ["word_reading", 2],
      ["word_meaning", 2], ["sentence_reading", 2], ["sentence_write", 1],
    ],
    "6": [
      ["meaning_choice", 10], ["hanja_choice", 10],
      ["category_pick", 1], ["sentence_reading", 1], ["sentence_hun", 1], ["wrong_word", 1], ["stroke_count", 1], ["antonym_char", 1],
      ["word_reading", 5], ["word_meaning", 3], ["word_write", 4], ["sentence_reading", 6], ["sentence_write", 2],
      ["antonym_word", 1], ["category_pick", 1], ["idiom_meaning", 1], ["moral", 1],
    ],
    "5p": [
      ["meaning_choice", 10], ["hanja_choice", 10],
      ["wrong_word", 1], ["sentence_reading", 1], ["sentence_hun", 1], ["stroke_count", 1], ["synonym_char", 1], ["antonym_char", 1],
      ["word_reading", 5], ["word_meaning", 3], ["word_write", 4], ["sentence_reading", 6], ["sentence_write", 2],
      ["antonym_word", 1], ["category_pick", 1], ["idiom_meaning", 1], ["moral", 1],
    ],
    "5": [
      ["meaning_choice", 8], ["hanja_choice", 7],
      ["category_pick", 1], ["sentence_hun", 2], ["stroke_count", 1], ["synonym_char", 1], ["antonym_char", 1], ["common_char", 1],
      ["word_reading", 9], ["word_meaning", 3], ["word_write", 3], ["sentence_reading", 4], ["sentence_write", 3],
      ["antonym_word", 2], ["idiom_meaning", 2], ["category_pick", 1], ["moral", 1],
    ],
  };

  // 어떤 한자로도 그 유형 문제를 만들 수 없을 때 대신 내는 유형
  const FALLBACK = {
    picture_choice: "hanja_choice",
    wrong_word: "sentence_write",
    sentence_hun: "meaning_choice",
    stroke_count: "meaning_choice",
    synonym_char: "hanja_choice",
    antonym_char: "hanja_choice",
    category_pick: "hanja_choice",
    antonym_word: "word_write",
    idiom_meaning: "word_meaning",
    common_char: "hanja_choice",
  };

  function build(grade) {
    const pool = A.poolForGrade(grade);
    const usage = new Map(); // 같은 한자가 시험에 너무 자주 나오지 않게 센다
    const usedMoral = new Set();
    const questions = [];

    const make = (type) => {
      if (type === "moral") return quiz.buildMoral(usedMoral);
      const candidates = quiz
        .shuffle(pool.filter((h) => quiz.hasType(h, type)))
        .sort((a, b) => (usage.get(a.id) || 0) - (usage.get(b.id) || 0));
      for (const h of candidates) {
        const q = quiz.BUILDERS[type](h, pool);
        if (q) {
          usage.set(h.id, (usage.get(h.id) || 0) + 1);
          return q;
        }
      }
      return type in FALLBACK ? make(FALLBACK[type]) : null;
    };

    BLUEPRINT[grade].forEach(([type, count]) => {
      for (let i = 0; i < count; i++) questions.push(make(type));
    });
    return { grade, questions: questions.map((q, i) => ({ ...q, no: i + 1 })) };
  }

  A.mock = { BLUEPRINT, build, total: (grade) => BLUEPRINT[grade].reduce((n, [, c]) => n + c, 0) };
})();
