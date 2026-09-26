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
const dateInText = (s) => {
  const m = String(s ?? "").match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(20\d{2})/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
};
const lev = (a, b) => {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
};

// ---- parse sheet (same logic as import4) ----
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
    rows.push({ row: r + 1, date: cur, plate, name: norm(x[4]), phone: normPhone(x[5]) });
  }
}
const dates = new Map(), rejected = [];
for (const r of rows) {
  const k = plateKey(r.plate);
  if (!validPlate(k)) { rejected.push(r); continue; }
  (dates.get(k) || dates.set(k, []).get(k)).push(iso(r.date));
}

(async () => {
  const [cs, vs] = await Promise.all([g.collection("clients").get(), g.collection("vehicles").get()]);
  const vById = new Map(vs.docs.map(d => [d.id, d]));
  const cById = new Map(cs.docs.map(d => [d.id, d]));
  const cols = (await g.listCollections()).map(c => c.id);
  const rootCols = (await db.listCollections()).map(c => c.id);
  console.log("garage subcollections:", JSON.stringify(cols), "| root collections:", JSON.stringify(rootCols));
  const scan = {};
  for (const n of cols) if (n !== "clients") scan[n] = (await g.collection(n).get()).docs;

  const ops = [], backup = { clients: [], repointed: [] };
  const finalIds = new Map(), deleted = new Set(), l2k = new Map();

  // ---- 1. MERGE DUPLICATE-PHONE CLIENTS ----
  console.log("\n=== 1. MERGE DUPLICATE CLIENTS ===");
  const byPhone = new Map();
  cs.docs.forEach(c => { const p = normPhone(c.data().phone); if (p) (byPhone.get(p) || byPhone.set(p, []).get(p)).push(c); });
  for (const [phone, arr] of byPhone) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) => (b.data().vehicleIds || []).length - (a.data().vehicleIds || []).length || a.id.localeCompare(b.id));
    const keep = sorted[0], losers = sorted.slice(1);
    const ids = [...(keep.data().vehicleIds || [])];
    backup.clients.push({ id: keep.id, data: keep.data() });
    console.log(`${phone}: KEEP ${keep.id} "${keep.data().name}" (${ids.length} veh)`);
    for (const l of losers) {
      const lids = l.data().vehicleIds || [];
      lids.forEach(v => { if (!ids.includes(v)) ids.push(v); });
      console.log(`   DROP ${l.id} "${l.data().name}" (${lids.length} veh, source=${l.data().source || "app"})`);
      backup.clients.push({ id: l.id, data: l.data() });
      deleted.add(l.id); l2k.set(l.id, keep.id);
      for (const n of Object.keys(scan)) for (const d of scan[n]) {
        const data = d.data();
        const fields = Object.keys(data).filter(f => data[f] === l.id || (Array.isArray(data[f]) && data[f].includes(l.id)));
        if (!fields.length) {
          let s = ""; try { s = JSON.stringify(data); } catch {}
          if (s.includes(l.id)) console.log(`      NESTED-REF (fix manually) ${n}/${d.id}`);
          continue;
        }
        const upd = {};
        fields.forEach(f => { upd[f] = Array.isArray(data[f]) ? [...new Set(data[f].map(v => v === l.id ? keep.id : v))] : keep.id; });
        console.log(`      repoint ${n}/${d.id} [${fields.join(",")}]`);
        backup.repointed.push({ path: `${n}/${d.id}`, before: Object.fromEntries(fields.map(f => [f, data[f]])) });
        ops.push({ type: "update", ref: d.ref, data: upd });
      }
      ops.push({ type: "delete", ref: l.ref });
    }
    finalIds.set(keep.id, ids);
  }
  vs.docs.forEach(v => {
    const k = l2k.get(v.data().clientId);
    if (k && !finalIds.get(k).includes(v.id)) finalIds.get(k).push(v.id);
  });

  // ---- 2. DANGLING vehicleIds ----
  console.log("\n=== 2. DANGLING vehicleIds ===");
  for (const c of cs.docs) {
    if (deleted.has(c.id)) continue;
    const base = finalIds.get(c.id) || c.data().vehicleIds || [];
    const clean = base.filter(v => vById.has(v));
    const bad = base.filter(v => !vById.has(v));
    if (bad.length) { console.log(`remove [${bad.join(",")}] from ${c.id} "${c.data().name}"`); backup.clients.push({ id: c.id, data: c.data() }); }
    if (finalIds.has(c.id) || bad.length) ops.push({ type: "update", ref: c.ref, data: { vehicleIds: clean } });
  }

  // ---- 3. BACKFILL VISIT DATES ON PRE-EXISTING VEHICLES ----
  console.log("\n=== 3. BACKFILL VISIT DATES (pre-existing vehicles found in sheet) ===");
  let nBack = 0;
  for (const v of vs.docs) {
    if (v.data().visitCount !== undefined) continue;
    const ds = dates.get(plateKey(v.data().plateKey || v.data().plate || v.id.replace(/^v_/, "")));
    if (!ds) { console.log(`no sheet match: ${v.id} (${v.data().plate})`); continue; }
    const u = [...new Set(ds)].sort();
    nBack++;
    console.log(`${v.id} ${v.data().plate}: ${u[0]}..${u[u.length - 1]} x${ds.length}`);
    ops.push({ type: "update", ref: v.ref, data: { firstVisit: u[0], lastVisit: u[u.length - 1], visitCount: ds.length, visitDates: u } });
  }

  // ---- 4. REJECTED ROWS: possible matches (report only) ----
  console.log("\n=== 4. REJECTED ROWS: POSSIBLE MATCHES (report only) ===");
  const vByPhone = new Map();
  vs.docs.forEach(v => { const c = cById.get(v.data().clientId); const p = c && normPhone(c.data().phone); if (p) (vByPhone.get(p) || vByPhone.set(p, []).get(p)).push(v); });
  rejected.forEach(r => {
    const k = plateKey(r.plate);
    const cand = k.length >= 3 ? (vByPhone.get(r.phone) || []).filter(v => { const vk = plateKey(v.data().plateKey || v.data().plate); return vk.startsWith(k) || lev(k, vk) <= 1; }).map(v => `${v.data().plate} [${v.id}]`) : [];
    console.log(`row ${r.row} ${iso(r.date)}: "${r.plate}" | ${r.name} | ${r.phone} -> ${cand.length ? cand.join(" ; ") : "no candidate"}`);
  });

  const nUpd = ops.filter(o => o.type === "update").length, nDel = ops.filter(o => o.type === "delete").length;
  console.log(`\nupdates: ${nUpd} | deletes: ${nDel} | backfilled vehicles: ${nBack}`);
  if (!WRITE) return console.log("DRY RUN - nothing written. Re-run with --write to commit.");

  const bk = `backup-patch-${Date.now()}.json`;
  fs.writeFileSync(bk, JSON.stringify(backup, null, 1));
  console.log("backup saved:", bk);
  const ordered = [...ops.filter(o => o.type === "update"), ...ops.filter(o => o.type === "delete")];
  for (let i = 0; i < ordered.length; i += 400) {
    const b = db.batch();
    ordered.slice(i, i + 400).forEach(o => o.type === "delete" ? b.delete(o.ref) : b.update(o.ref, o.data));
    await b.commit();
  }
  console.log("DONE - written.");
})().catch(e => console.error(e));
