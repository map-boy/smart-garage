const fs = require("fs"), path = require("path");

const ROOT = "src-tauri/src";
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (f.endsWith(".rs")) files.push(p);
  }
})(ROOT);

console.log("=== FILES ===");
files.forEach(f => console.log(f, fs.statSync(f).size, "bytes"));

console.log("\n=== #[tauri::command] fn NAMES ===");
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const re = /#\[tauri::command\]\s*\n\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(text))) console.log(`${f}: ${m[1]}(${m[2].replace(/\s+/g," ").trim()})`);
}

console.log("\n=== CREATE TABLE statements ===");
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const re = /CREATE TABLE[^;]*;/gis;
  const m = text.match(re);
  if (m) { console.log(`--- ${f} ---`); m.forEach(s => console.log(s.replace(/\s+/g, " "))); }
}

console.log("\n=== id generation (uuid / nanoid / format!) near INSERT ===");
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const re = /(uuid::Uuid::new_v4\(\)|nanoid!|format!\(\s*"[^"]*"\s*,[^)]*\))/g;
  const m = text.match(re);
  if (m) console.log(`${f}: ${[...new Set(m)].join(" | ")}`);
}

console.log("\n=== find main.rs / lib.rs invoke_handler list ===");
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  if (text.includes("generate_handler")) {
    console.log(`--- ${f} ---`);
    const m = text.match(/generate_handler!\[[\s\S]*?\]/);
    if (m) console.log(m[0]);
  }
}
