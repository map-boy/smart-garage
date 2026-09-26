const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const XLSX = require("xlsx");
const fs = require("fs");

const FILE = "C:\\Users\\user\\Downloads\\VOLKSWAGEN SEP.xlsx";
const GARAGE = "garage-aimable-001";
const WRITE = process.argv.includes("--write");
const DEFAULT_DATE = new Date(Date.UTC(2026, 8, 1));

initializeApp({ credential: cert(require("./service-account.json")) });
const db = getFirestore();
const g = db.collection("garages").doc(GARAGE);

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const normPhone = (v) => { let d = String(v ?? "").replace(/\D/g, ""); if (d.startsWith("250") && d.length === 12) d = d.slice(3); if (d.length === 9) d = "0" + d; return d; };
const plateKey = (p) => String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const validPlate = (k) => /^R[A-Z]{2}\d{3}[A-Z]$/.test(k);
const iso = (d) => d.toISOString().slice(0, 10);
const model = (s) => { s = norm(s);
  if (/^(teramont|termont|teramont\s*x?)$/i.test(s)) return "Teramont";
  if (/^t-?c(ross)?$/i.test(s)) return "T-Cross";
  if (/^v(irtus)?$/i.test(s)) return "Virtus";
  if (/^e-?golf$/i.test(s)) return "e-Golf";
  if (/^touareg$/i.test(s)) return "Touareg";
  return s; };
const dateInText = (s) => { const m = String(s ?? "").match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(20\d{2})/); if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; return new Date(Date.UTC(y, mo - 1, d)); };
const lev = (a, b) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i-1][j]+1, m[i][j-1]+1, m[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return m[a.length][b.length]; };

// ---- parse sheet ----
const wb = XLSX.readFile(FILE);
const rows = [];
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name], map = {};
  for (const k of Object.keys(ws)) { if (k[0] === "!") continue; const c = XLSX.utils.decode_cell(k); if (c.c > 5) continue; (map[c.r] ||= {})[c.c] = ws[k].v; }
  let cur = DEFAULT_DATE;
  for (const r of Object.keys(map).map(Number).sort((a, b) => a - b)) {
    const x = map[r], plate = norm(x[2]);
    if (!plate) { const sd = dateInText(x[0]) || dateInText(x[1]); if (sd) cur = sd; continue; }
    if (/plate/i.test(plate)) continue;
    rows.push({ row: r + 1, date: iso(cur), model: model(x[1]), plate, location: norm(x[3]), name: norm(x[4]), phone: normPhone(x[5]) });
  }
}
const good = rows.filter(r => validPlate(plateKey(r.plate)));
const bad = rows.filter(r => !validPlate(plateKey(r.plate)));

(async () => {
  const [cs, vs] = await Promise.all([g.collection("clients").get(), g.collection("vehicles").get()]);
  const vByKey = new Map(), vById = new Map();
  vs.docs.forEach(d => { vById.set(d.id, d); vByKey.set(plateKey(d.data().plateKey || d.data().plate || d.id.replace(/^v_/, "")), d); });
  const cById = new Map(cs.docs.map(d => [d.id, d]));
  const cByPhone = new Map();
  cs.docs.forEach(d => { const p = normPhone(d.data().phone); if (p) cByPhone.set(p, d); });

  // ---- 1. resolve rejected plates ----
  const repaired = [], unresolved = [];
  for (const r of bad) {
    const k = plateKey(r.plate);
    const c = cByPhone.get(r.phone);
    const own = c ? (c.data().vehicleIds || []).map(id => vById.get(id)).filter(Boolean) : [];
    const ownKeys = own.map(v => ({ v, k: plateKey(v.data().plateKey || v.data().plate) }));
    let hit = null, how = "";
    if (k.length >= 4) {
      let cand = ownKeys.filter(o => o.k.startsWith(k) || k.startsWith(o.k) || lev(k, o.k) <= 1);
      if (cand.length === 1) { hit = cand[0].v; how = "phone+fuzzy"; }
      if (!hit) { cand = [...vByKey.entries()].filter(([vk]) => lev(k, vk) <= 1); if (cand.length === 1) { hit = cand[0][1]; how = "global-fuzzy"; } }
    }
    if (!hit && own.length === 1) { hit = own[0]; how = "phone-only(single car)"; }
    if (hit) repaired.push({ r, v: hit, how }); else unresolved.push(r);
  }

  // ---- 2. dates per vehicle doc id ----
  const datesById = new Map();
  const add = (id, d) => { (datesById.get(id) || datesById.set(id, []).get(id)).push(d); };
  let noMatch = 0;
  for (const r of good) { const v = vByKey.get(plateKey(r.plate)); if (!v) { noMatch++; continue; } add(v.id, r.date); }
  for (const x of repaired) add(x.v.id, x.r.date);

  // ---- 3. build ops ----
  const ops = [], backup = { vehicles: [], clients: [] }, vlog = [];
  const newDatesByClient = new Map();
  for (const [id, ds] of datesById) {
    const v = vById.get(id), d = v.data();
    const merged = [...new Set([...(d.visitDates || []), ...ds])].sort();
    const count = Math.max(d.visitCount || 0, merged.length);
    const cid = d.clientId;
    if (cid) { const a = newDatesByClient.get(cid) || newDatesByClient.set(cid, []).get(cid); a.push(...merged); }
    if (merged.length === (d.visitDates || []).length && d.visitCount !== undefined && !(!d.plateKey || !d.make)) continue;
    backup.vehicles.push({ id, data: d });
    ops.push({ ref: v.ref, data: { visitDates: merged, firstVisit: merged[0], lastVisit: merged[merged.length - 1], visitCount: count,
      plateKey: d.plateKey || plateKey(d.plate || id.replace(/^v_/, "")), make: d.make || "Volkswagen", model: d.model || "" } });
    vlog.push(`${d.plate} | ${(d.visitDates || []).length} -> ${merged.length} dates (${merged[0]}..${merged[merged.length - 1]})`);
  }

  const clog = [];
  for (const [cid, ds] of newDatesByClient) {
    const c = cById.get(cid); if (!c) continue;
    const all = [...new Set(ds)].sort();
    const f = [c.data().firstVisit, all[0]].filter(Boolean).sort()[0];
    const l = [c.data().lastVisit, all[all.length - 1]].filter(Boolean).sort().pop();
    if (c.data().firstVisit === f && c.data().lastVisit === l) continue;
    backup.clients.push({ id: cid, data: c.data() });
    ops.push({ ref: c.ref, data: { firstVisit: f || "", lastVisit: l || "" } });
    clog.push(`${c.data().name} (${c.data().phone}): ${c.data().firstVisit || "-"}..${c.data().lastVisit || "-"} -> ${f}..${l}`);
  }

  console.log("=== REPAIRED PLATES ===");
  repaired.forEach(x => console.log(`row ${x.r.row} ${x.r.date}: "${x.r.plate}" -> ${x.v.data().plate} [${x.v.id}] via ${x.how} | ${x.r.name}`));
  console.log("\n=== STILL UNRESOLVED (manual) ===");
  unresolved.forEach(r => console.log(`row ${r.row} ${r.date}: "${r.plate}" | ${r.name} | ${r.phone}`));
  console.log("\n=== VEHICLE UPDATES ===");
  vlog.forEach(l => console.log(l));
  console.log("\n=== CLIENT DATE UPDATES ===");
  clog.forEach(l => console.log(l));
  console.log(`\nrows ${rows.length} | good ${good.length} | rejected ${bad.length} (repaired ${repaired.length}, unresolved ${unresolved.length}) | plates with no vehicle doc ${noMatch}`);
  console.log(`vehicle updates ${vlog.length} | client updates ${clog.length} | total ops ${ops.length}`);
  if (!WRITE) return console.log("DRY RUN - nothing written. Re-run with --write to commit.");

  const bk = `backup-sep-${Date.now()}.json`;
  fs.writeFileSync(bk, JSON.stringify(backup, null, 1));
  console.log("backup saved:", bk);
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach(o => b.set(o.ref, o.data, { merge: true }));
    await b.commit();
  }
  console.log("DONE - written.");
})().catch(e => console.error(e));
