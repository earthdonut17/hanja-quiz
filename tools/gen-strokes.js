// 사용법: node tools/gen-strokes.js <hanzi-writer-data 폴더>
// 한자별 총획수만 뽑아 js/hanja_strokes.js를 만든다(글자 모양 데이터는 옮기지 않는다).
// 획수 데이터: npm 패키지 hanzi-writer-data의 획 개수. 패키지에 없는 한자는 아래 MANUAL에 직접 적는다.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dataDir = process.argv[2];
if (!dataDir) {
  console.error("hanzi-writer-data 폴더 경로를 주세요.");
  process.exit(1);
}
const root = path.join(__dirname, "..");
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ["hanja.js", "hanja_g6.js", "hanja_g5a.js", "hanja_g5b.js", "hanja_g5c.js", "hanja_extra.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "js", f), "utf8"), sandbox);
}
const A = sandbox.window.HanjaApp;
const chars = new Set(A.RAW.map((r) => r[0]));
Object.values(A.BOOKS).forEach((t) => t.split("|").forEach((tok) => chars.add(tok.split(" ")[0])));

// 패키지에 없는 한자(우리나라에서 쓰는 모양)의 총획수
const MANUAL = { 敎: 11, 氷: 5, 眞: 10, 擧: 18, 飮: 13, 强: 11 };

// 우리나라 한자 사전은 풀초머리(艹)·책받침(辶)·보일시변(礻)·오른쪽 고을읍(阝)을 중국식 계산보다 1획 많게 세고,
// 成도 한 획 더 센다. 이런 한자는 패키지 값에 1을 더한다(tests/verify-data.js의 알려진 값과 대조해 확인했다).
const KOREAN_PLUS_ONE = new Set([..."草花英近道速送逆進通遠部社神祖成"]);

const out = {};
const missing = [];
for (const c of chars) {
  const file = path.join(dataDir, c + ".json");
  if (MANUAL[c]) out[c] = MANUAL[c];
  else if (fs.existsSync(file)) out[c] = JSON.parse(fs.readFileSync(file, "utf8")).strokes.length + (KOREAN_PLUS_ONE.has(c) ? 1 : 0);
  else missing.push(c);
}
if (missing.length) console.warn("획수를 찾지 못한 한자:", missing.join(" "));
const body = Object.keys(out).map((c) => `${c}:${out[c]}`).join(" ");
fs.writeFileSync(
  path.join(root, "js", "hanja_strokes.js"),
  `// 한자별 총획수 (tools/gen-strokes.js로 만든 파일)\nwindow.HanjaApp = window.HanjaApp || {};\nwindow.HanjaApp.STROKES = Object.fromEntries(\n  "${body}".split(" ").map((s) => { const [c, n] = s.split(":"); return [c, Number(n)]; })\n);\n`
);
console.log(`획수 ${Object.keys(out).length}자 저장`);
