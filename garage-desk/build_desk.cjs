const fs = require("fs"), path = require("path"), cp = require("child_process");

console.log("=== config ===");
const confPath = ["src-tauri/tauri.conf.json", "src-tauri/tauri.conf.json5"].find(fs.existsSync);
if (!confPath) { console.log("no tauri.conf.json found - stop and tell me"); process.exit(1); }
const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
console.log("file        :", confPath);
console.log("productName :", conf.productName);
console.log("version     :", conf.version);
console.log("identifier  :", conf.identifier);
console.log("bundle      :", JSON.stringify(conf.bundle || {}, null, 2));
console.log("CARGO_TARGET_DIR:", process.env.CARGO_TARGET_DIR || "(not set)");
if (String(conf.identifier || "").startsWith("com.tauri.dev"))
  console.log("!!! identifier is the Tauri default - the build will refuse until you change it");

console.log("\n=== building (first run downloads NSIS tools, needs internet; expect a few minutes) ===");
const started = Date.now();
const r = cp.spawnSync("npm run tauri build -- --bundles nsis", { shell: true, stdio: "inherit" });
console.log("\nbuild exit code:", r.status);

console.log("\n=== installers found ===");
const roots = [process.env.CARGO_TARGET_DIR, "C:/cargo-targets/garage-desk", "src-tauri/target"].filter(Boolean);
const found = [];
for (const root of roots) {
  const dir = path.join(root, "release", "bundle", "nsis");
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.toLowerCase().endsWith(".exe")) continue;
    const p = path.join(dir, f), st = fs.statSync(p);
    found.push({ p, mb: (st.size / 1048576).toFixed(1), mtime: st.mtime, fresh: st.mtimeMs >= started });
  }
}
found.sort((a, b) => b.mtime - a.mtime);
found.forEach(x => console.log((x.fresh ? "NEW  " : "old  ") + x.p + "  " + x.mb + " MB  " + x.mtime.toLocaleString()));
if (!found.length) console.log("none found - paste the build output above");
else cp.exec('explorer "' + path.dirname(found[0].p) + '"');
