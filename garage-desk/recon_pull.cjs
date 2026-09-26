const fs = require("fs");
const rd = f => fs.readFileSync(f, "utf8");
const FILES = ["src-tauri/src/main.rs", "src/db.ts", "src/sync.ts", "src/App.tsx"];

function show(f, from, to) {
  const lines = rd(f).split(/\r?\n/);
  for (let i = Math.max(0, from - 1); i < Math.min(lines.length, to); i++)
    console.log(String(i + 1).padStart(4), lines[i]);
}
function grep(f, re, ctx = 0) {
  const lines = rd(f).split(/\r?\n/);
  lines.forEach((l, i) => {
    if (re.test(l)) {
      console.log(`--- ${f}:${i + 1}`);
      for (let j = Math.max(0, i - ctx); j <= Math.min(lines.length - 1, i + ctx); j++)
        console.log(String(j + 1).padStart(4), lines[j]);
    }
  });
}

console.log("=== line endings / size ===");
for (const f of FILES) {
  const t = rd(f);
  console.log(f, t.length, "chars | CRLF:", (t.match(/\r\n/g) || []).length, "| LF-only:", (t.match(/(?<!\r)\n/g) || []).length);
}

console.log("\n=== git status ===");
try { console.log(require("child_process").execSync("git status --short", { encoding: "utf8" }) || "(clean or no changes)"); }
catch (e) { console.log("git not available:", e.message.split("\n")[0]); }

console.log("\n=== main.rs: use lines ===");
grep("src-tauri/src/main.rs", /^use /);

console.log("\n=== main.rs: Client / Visit structs (derives matter for Vec<Client> params) ===");
grep("src-tauri/src/main.rs", /struct (Client|Visit)\b/, 12);

console.log("\n=== main.rs: key markers ===");
grep("src-tauri/src/main.rs", /^fn main|tauri::#\[tauri::command\]|main_placeholder_anchor_unused|generate_handler|fn upsert_remote_/);

console.log("\n=== main.rs: broken region (from 15 lines before the bad line, 110 lines on) ===");
{
  const lines = rd("src-tauri/src/main.rs").split(/\r?\n/);
  const idx = lines.findIndex(l => l.includes("tauri::#[tauri::command]"));
  if (idx >= 0) show("src-tauri/src/main.rs", idx + 1 - 15, idx + 1 + 110);
  else console.log("bad line not found");
}

console.log("\n=== db.ts: pull exports + Client/Visit types ===");
grep("src/db.ts", /upsertRemote/);
grep("src/db.ts", /export (type|interface) (Client|Visit)\b/, 14);

console.log("\n=== sync.ts: first 45 lines (imports) ===");
show("src/sync.ts", 1, 45);
console.log("\n=== sync.ts: symbols my pull code depends on ===");
grep("src/sync.ts", /getDocs|ensureStaffProfile|getFirebaseDb|GARAGE_ID|export function startSyncLoop|from "\.\/db"/);
console.log("\n=== sync.ts: last 20 lines ===");
{
  const n = rd("src/sync.ts").split(/\r?\n/).length;
  show("src/sync.ts", n - 20, n);
}

console.log("\n=== App.tsx: imports, state, refresh, Export Monthly area ===");
grep("src/App.tsx", /from "\.\/sync"|from "\.\/db"/);
grep("src/App.tsx", /const \[editingId|const \[editDraft/);
grep("src/App.tsx", /(const|async function|function) refresh/);
grep("src/App.tsx", /Export Monthly/, 8);
