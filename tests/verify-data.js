// 사용법: node tests/verify-data.js
// 1) 대한검정회 배정한자(나무위키 「한자급수자격검정/배정한자」)와 데이터를 대조한다.
// 2) 한자어·예문·보조 자료가 앱의 문제 생성 규칙을 지키는지 검사한다.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { window: {} };
vm.createContext(sandbox);
const FILES = [
  "hanja.js", "hanja_g6.js", "hanja_g5a.js", "hanja_g5b.js", "hanja_g5c.js", "hanja_extra.js",
  "hanja_sentences.js", "hanja_strokes.js", "hanja_meta.js", "hanja_build.js",
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), sandbox);
const A = sandbox.window.HanjaApp;
const { HANJA, HANJA_BY_ID: byId } = A;

// 공식 신출 한자 "한자 훈 음" (쉼표로 구분)
const OFFICIAL = {
  8: "九 아홉 구,金 쇠 금,南 남녘 남,男 사내 남,女 여자 녀,東 동녘 동,六 여섯 륙,母 어머니 모,木 나무 목,門 문 문,父 아버지 부,北 북녘 북,四 넉 사,三 석 삼,西 서녘 서,水 물 수,十 열 십,五 다섯 오,月 달 월,二 두 이,人 사람 인,日 날 일,一 한 일,子 아들 자,弟 아우 제,七 일곱 칠,土 흙 토,八 여덟 팔,兄 맏 형,火 불 화",
  7: "江 강 강,口 입 구,內 안 내,年 해 년,大 큰 대,目 눈 목,白 흰 백,山 메 산,上 위 상,小 작을 소,手 손 수,外 바깥 외,右 오른 우,入 들 입,足 발 족,左 왼 좌,中 가운데 중,靑 푸를 청,出 날 출,下 아래 하",
  6: "犬 개 견,己 몸 기,林 수풀 림,馬 말 마,名 이름 명,百 일백 백,生 날 생,石 돌 석,先 먼저 선,姓 성씨 성,心 마음 심,羊 양 양,魚 물고기 어,玉 구슬 옥,牛 소 우,耳 귀 이,地 땅 지,川 내 천,千 일천 천,天 하늘 천",
  "5p": "車 수레 거,巾 수건 건,古 예 고,工 장인 공,今 이제 금,同 한가지 동,力 힘 력,立 설 립,末 끝 말,文 글월 문,方 모 방,本 근본 본,夫 지아비 부,不 아니 불,士 선비 사,夕 저녁 석,世 세상 세,少 적을 소,食 먹을 식,央 가운데 앙,王 임금 왕,位 자리 위,衣 옷 의,字 글자 자,自 스스로 자,正 바를 정,主 주인 주,寸 마디 촌,向 향할 향,休 쉴 휴",
  5: "歌 노래 가,家 집 가,各 각각 각,間 사이 간,强 강할 강,開 열 개,去 갈 거,見 볼 견,京 서울 경,計 셀 계,高 높을 고,功 공 공,空 빌 공,共 함께 공,科 과목 과,光 빛 광,敎 가르칠 교,交 사귈 교,校 학교 교,區 나눌 구,國 나라 국,軍 군사 군,近 가까울 근,急 급할 급,旗 기 기,記 기록할 기,氣 기운 기,農 농사 농,多 많을 다,短 짧을 단,答 대답 답,當 마땅할 당,對 대답할 대,代 대신할 대,道 길 도,刀 칼 도,讀 읽을 독,冬 겨울 동,洞 고을 동,頭 머리 두,等 무리 등,登 오를 등,樂 즐거울 락,來 올 래,老 늙을 로,理 다스릴 리,里 마을 리,利 이로울 리,萬 일만 만,每 매양 매,面 낯 면,命 목숨 명,明 밝을 명,毛 털 모,無 없을 무,聞 들을 문,問 물을 문,物 물건 물,米 쌀 미,民 백성 민,班 나눌 반,半 절반 반,放 놓을 방,番 차례 번,別 다를 별,步 걸음 보,部 거느릴 부,分 나눌 분,社 모일 사,事 일 사,死 죽을 사,色 빛 색,書 글 서,線 줄 선,性 성품 성,成 이룰 성,所 바 소,首 머리 수,詩 글 시,時 때 시,示 보일 시,市 저자 시,植 심을 식,神 귀신 신,身 몸 신,信 믿을 신,新 새로울 신,室 집 실,安 편안할 안,夜 밤 야,弱 약할 약,語 말씀 어,言 말씀 언,永 길 영,英 꽃부리 영,午 낮 오,用 쓸 용,友 벗 우,遠 멀 원,原 언덕,근본 원,元 으뜸 원,有 있을 유,肉 고기 육,育 기를 육,銀 은 은,音 소리 음,邑 고을 읍,意 뜻 의,作 지을 작,長 긴 장,場 마당 장,才 재주 재,田 밭 전,電 번개 전,前 앞 전,全 온전할 전,朝 아침 조,祖 할아비 조,晝 낮 주,住 살 주,竹 대 죽,重 무거울 중,直 곧을 직,草 풀 초,村 마을 촌,秋 가을 추,春 봄 춘,親 친할 친,太 클 태,通 통할 통,貝 조개 패,便 편할 편,平 평평할 평,夏 여름 하,學 배울 학,韓 나라이름 한,漢 한수 한,合 합할 합,海 바다 해,行 다닐 행,血 피 혈,形 모양 형,花 꽃 화,話 말씀 화,和 화할,화목할 화,活 살 활,黃 누를 황,會 모일 회,孝 효도 효,後 뒤 후",
};
const COUNT = { 8: 30, 7: 20, 6: 20, "5p": 30, 5: 150 };

let errors = 0;
let warns = 0;
const fail = (msg) => { errors++; console.error("✗", msg); };
const warn = (msg) => { warns++; console.warn("△", msg); };

// 1) 급수별 개수·훈음을 공식 목록과 대조
for (const g of Object.keys(COUNT)) {
  // 훈에 쉼표가 있는 항목("언덕,근본 원" 등)이 있어서, 쉼표 뒤에 "한자 + 공백"이 올 때만 항목을 나눈다.
  const merged = OFFICIAL[g].split(/,(?=[㐀-鿿豈-﫿] )/).map((s) => s.split(" "));
  if (merged.length !== COUNT[g]) fail(`${g}급 공식 목록 개수 ${merged.length} (기대 ${COUNT[g]})`);
  const mine = HANJA.filter((h) => h.grade === g);
  if (mine.length !== COUNT[g]) fail(`${g}급 데이터 개수 ${mine.length} (기대 ${COUNT[g]})`);
  merged.forEach(([hanja, hun, eum]) => {
    const h = mine.find((x) => x.hanja === hanja);
    if (!h) return fail(`${g}급에 ${hanja} 없음`);
    if (h.hun !== hun || h.eum !== eum) fail(`${hanja}: 훈음 불일치 (공식 ${hun} ${eum} / 데이터 ${h.hun} ${h.eum})`);
  });
  mine.forEach((h) => {
    if (!merged.some(([x]) => x === h.hanja)) fail(`${g}급 데이터에 공식 목록에 없는 한자 ${h.hanja}`);
  });
}
if (HANJA.filter((h) => h.grade !== "x").length !== 250) fail("8~5급 한자는 모두 250자여야 함");

// 2) 중복 검사: 한자, 훈음(객관식에서 정답이 둘이 되면 안 된다)
const seenLabel = new Map();
HANJA.forEach((h) => {
  if (seenLabel.has(h.label)) fail(`훈음 중복: ${h.label} (${seenLabel.get(h.label)}, ${h.hanja})`);
  seenLabel.set(h.label, h.hanja);
});

// 3) 한자어 규칙
const allWords = new Map(); // 한자어 → 독음
HANJA.forEach((h) => {
  if (h.grade !== "x" && h.words.length < 2) warn(`${h.hanja}: 한자어 예시가 ${h.words.length}개`);
  h.words.forEach((w) => {
    if ([...w.h].length !== [...w.r].length) fail(`${h.hanja} ${w.h}: 독음 글자 수(${w.r})가 다름`);
    const count = [...w.h].filter((c) => c === h.hanja).length;
    if (count !== 1) fail(`${h.hanja} ${w.h}: 한자가 ${count}번 들어 있음 (정확히 1번이어야 함)`);
    if (!/^[가-힣]+$/.test(w.r)) fail(`${h.hanja} ${w.h}: 독음에 한글 아닌 글자 (${w.r})`);
    if (!w.m) fail(`${h.hanja} ${w.h}: 뜻풀이 없음`);
    if (allWords.has(w.h) && allWords.get(w.h) !== w.r) fail(`${w.h}: 독음이 서로 다름 (${allWords.get(w.h)} / ${w.r})`);
    allWords.set(w.h, w.r);
    [...w.h].forEach((c, i) => {
      const o = byId.get(c);
      if (!o) return warn(`${w.h}: ${c}는 8~5급·교재 목록에 없는 한자`);
      const syll = [...w.r][i];
      if (![o.eum, ...o.alt].includes(syll)) warn(`${w.h}(${w.r}) 의 ${c}: ${syll} (기본 ${o.eum}${o.alt.length ? "/" + o.alt.join("/") : ""})`);
    });
  });
});
// 같은 독음을 가진 다른 한자어(동음이의어)는 쓰기 문제의 보기에서 정답과 헷갈릴 수 있어 목록을 보여 준다.
const byReading = new Map();
allWords.forEach((r, w) => byReading.set(r, [...(byReading.get(r) || []), w]));
const homophones = [...byReading.entries()].filter(([, ws]) => ws.length > 1);
if (homophones.length) console.log(`  (동음이의 한자어 ${homophones.length}쌍 - 문제 생성 때 서로를 오답으로 쓰지 않는다): ${homophones.map(([r, ws]) => `${r}=${ws.join("/")}`).join(", ")}`);

// 4) 예문 규칙
const sentenceWords = new Set();
HANJA.forEach((h) => h.words.forEach((w) => w.s && sentenceWords.add(w.h)));
Object.entries(A.SENTENCES).forEach(([w, s]) => {
  if (!allWords.has(w)) return fail(`예문의 한자어 ${w}가 한자어 목록에 없음`);
  const m = s.match(/\{([^}]+)\}/g) || [];
  if (m.length !== 1) return fail(`${w}: 예문에 {독음}이 정확히 하나여야 함 → ${s}`);
  if (m[0].slice(1, -1) !== allWords.get(w)) fail(`${w}: 예문 속 독음(${m[0]})이 한자어 독음(${allWords.get(w)})과 다름`);
  if (s.replace(/\{[^}]+\}/, "").includes(allWords.get(w))) warn(`${w}: 예문 다른 곳에 같은 독음이 또 나옴 → ${s}`);
});
const noSentence = HANJA.filter((h) => h.grade !== "x" && !h.sentenceWords.length);
if (noSentence.length) warn(`예문이 없는 한자 ${noSentence.length}자: ${noSentence.map((h) => h.hanja).join("")}`);

// 5) 획수: 한자별로 확실히 아는 값과 대조
const KNOWN_STROKES = "九2 金8 南9 男7 女3 東8 六4 母5 木4 門8 父4 北5 四5 三3 西6 水4 十2 五4 月4 二2 人2 日4 一1 子3 弟7 七2 土3 八2 兄5 火4 江6 口3 內4 年6 大3 目5 白5 山3 上3 小3 手4 外5 右5 入2 足7 左5 中4 靑8 出5 下3 犬4 己3 林8 馬10 名6 百6 生5 石5 先6 姓8 心4 羊6 魚11 玉5 牛4 耳6 地6 川3 千3 天4 車7 巾3 古5 工3 今4 同6 力2 立5 末5 文4 方4 本5 夫4 不4 士3 夕3 世5 少4 食9 央5 王4 位7 衣6 字6 自6 正5 主5 寸3 向6 休6 學16 國11 敎11 區11 農13 黃12 來8 樂15 聞14 長8 電13 草10 親16 會13 韓17 漢14 歌14 家10 各6 間12 强11 開12 去5 見7 京8 計9 高10 功5 空8 共6 科9 光6 交6 校10 軍9 急9 旗14 記10 氣10 多6 短12 答12 當13 對14 代5 刀2 讀22 冬5 洞9 頭16 等12 登12 老6 理11 里7 利7 每7 面9 命8 明8 毛4 無12 問11 物8 米6 民5 班10 半5 放8 番12 別7 步7 部11 分4 社8 事8 死6 色6 線15 性8 成7 所8 首9 詩13 時10 示5 市5 植12 神10 身7 信9 新13 室9 安6 夜8 弱10 語14 言7 永5 午4 用5 友4 原10 元4 有6 肉6 育8 銀14 音9 邑7 意13 作7 場12 才3 田5 前9 全6 朝12 祖10 晝11 住7 竹6 重9 直8 村7 秋9 春9 太4 貝7 便9 平5 夏10 合6 海10 行6 血6 形7 話13 和8 活9 孝7 後9 近8 道13 通11 遠14 花8 草10 英9 萬13";
KNOWN_STROKES.split(" ").forEach((tok) => {
  const c = tok[0];
  const n = Number(tok.slice(1));
  const h = byId.get(c);
  if (!h) return;
  if (h.strokes !== n) fail(`${c}: 총획 ${h.strokes} (알려진 값 ${n})`);
});
HANJA.filter((h) => h.grade !== "x" && !h.strokes).forEach((h) => fail(`${h.hanja}: 총획 정보 없음`));

// 6) 보조 자료
const emojiSeen = new Map();
Object.entries(A.PICTURES).forEach(([c, e]) => {
  if (!byId.has(c)) fail(`그림 한자 ${c}가 목록에 없음`);
  if (emojiSeen.has(e)) fail(`그림 ${e}가 ${emojiSeen.get(e)}와 ${c}에 중복됨`);
  emojiSeen.set(e, c);
});
Object.entries(A.CATEGORIES).forEach(([name, chars]) => [...chars].forEach((c) => !byId.has(c) && fail(`분류 ${name}의 ${c}가 목록에 없음`)));
const catSeen = new Map();
Object.entries(A.CATEGORIES).forEach(([name, chars]) => [...chars].forEach((c) => {
  if (catSeen.has(c)) fail(`분류 중복: ${c} (${catSeen.get(c)}, ${name})`);
  catSeen.set(c, name);
}));
A.ANTONYM_CHARS.forEach((p) => [...p].forEach((c) => !byId.has(c) && fail(`반의자 ${p}의 ${c}가 목록에 없음`)));
A.SYNONYM_GROUPS.forEach((g) => g.forEach((c) => !byId.has(c) && fail(`유의자 ${g.join("")}의 ${c}가 목록에 없음`)));
A.WORD_ANTONYMS.forEach(([w1, w2, o1, o2]) => {
  if (!w1.includes(o1) || !w2.includes(o2)) fail(`반의어 ${w1}-${w2}: 대표 한자가 낱말에 없음`);
  [...w1, ...w2].forEach((c) => !byId.has(c) && warn(`반의어 ${w1}-${w2}: ${c}는 목록에 없는 한자`));
});
A.IDIOMS.forEach(([h, r, m, owner]) => {
  if ([...h].length !== 4 || [...r].length !== 4) fail(`사자성어 ${h}: 4글자여야 함`);
  if (![...h].includes(owner)) fail(`사자성어 ${h}: 대표 한자 ${owner}가 없음`);
  [...h].forEach((c) => !byId.has(c) && fail(`사자성어 ${h}: ${c}가 목록에 없음`));
});
A.MORAL.forEach((q, i) => {
  if (q.w.length !== 3) fail(`인성 문제 ${i + 1}: 오답은 3개여야 함`);
  if (new Set([q.a, ...q.w]).size !== 4) fail(`인성 문제 ${i + 1}: 보기가 겹침`);
});

// 7) 교재 한자: 같은 한자의 훈음이 책마다 다른 경우를 알려 준다
const bookHun = new Map();
Object.entries(A.BOOKS).forEach(([book, text]) => text.split("|").forEach((tok) => {
  const [c, hun, eum] = tok.split(" ");
  const key = `${hun} ${eum}`;
  if (!bookHun.has(c)) bookHun.set(c, new Map());
  bookHun.get(c).set(book, key);
}));
const extras = HANJA.filter((h) => h.grade === "x");
extras.forEach((h) => {
  const labels = new Set(bookHun.get(h.hanja).values());
  if (labels.size > 1) warn(`교재 한자 ${h.hanja}: 책마다 훈음이 다름 → ${[...bookHun.get(h.hanja)].map(([b, l]) => `${b}:${l}`).join(", ")}`);
});
const inList = HANJA.filter((h) => h.grade !== "x" && h.books.length).length;

console.log(
  `한자 ${HANJA.length}자: 8급 ${HANJA.filter((h) => h.grade === "8").length}, 7급 ${HANJA.filter((h) => h.grade === "7").length}, 6급 ${HANJA.filter((h) => h.grade === "6").length}, ` +
  `준5급 ${HANJA.filter((h) => h.grade === "5p").length}, 5급 ${HANJA.filter((h) => h.grade === "5").length}, 교재 한자 ${extras.length}`
);
console.log(`한자어 ${allWords.size}개, 예문 ${Object.keys(A.SENTENCES).length}개, 교재에도 나오는 급수 한자 ${inList}자`);
if (errors) {
  console.error(`실패: ${errors}건 (경고 ${warns}건)`);
  process.exit(1);
}
console.log(`✓ 데이터 검증 통과 (경고 ${warns}건)`);
