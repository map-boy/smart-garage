const fs = require("fs"), path = require("path");

const SRC = "src";
const exts = new Set([".ts", ".tsx", ".js", ".jsx"]);
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (f !== "node_modules") walk(p); }
    else if (exts.has(path.extname(f))) files.push(p);
  }
})(SRC);

console.log(`=== SCANNED ${files.length} FILES ===\n`);

const patterns = {
  "collection('clients')/(\"clients\")": /collection\(\s*["'`]clients["'`]/g,
  "collection('vehicles')/(\"vehicles\")": /collection\(\s*["'`]vehicles["'`]/g,
  "garages/garage doc refs": /collection\(\s*["'`]garages["'`]/g,
  "where(...)": /\.where\([^)]*\)/g,
  "orderBy(...)": /\.orderBy\([^)]*\)/g,
  "field: visitDates": /visitDates/g,
  "field: visitCount": /visitCount/g,
  "field: firstVisit": /firstVisit/g,
  "field: lastVisit": /lastVisit/g,
  "field: plateKey": /plateKey/g,
  "field: vehicleIds": /vehicleIds/g,
  "field: clientId": /clientId/g,
  "field: source (excel-import etc)": /\bsource\b\s*[:=]/g,
  "GARAGE id / garage-aimable": /garage-aimable[-\w]*/g,
  "env var usage (VITE_)": /import\.meta\.env\.VITE_\w+/g,
};

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const hits = {};
  for (const [label, re] of Object.entries(patterns)) {
    const m = text.match(re);
    if (m) hits[label] = m.length;
  }
  if (Object.keys(hits).length) {
    console.log(`--- ${file} ---`);
    for (const [label, n] of Object.entries(hits)) console.log(`  ${label}: ${n}`);
  }
}

console.log("\n=== .env (garage id / firebase project) ===");
for (const f of [".env", ".env.example"]) {
  if (fs.existsSync(f)) { console.log(`-- ${f} --`); console.log(fs.readFileSync(f, "utf8")); }
}
