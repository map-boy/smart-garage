const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");

const GARAGE = "garage-aimable-001";
const WRITE = process.argv.includes("--write");

// wrong auto-matches to undo: [vehicleDocId, dateToRemove]
const REMOVE = [["v_RAF585X", "2026-09-04"], ["v_RAJ989I", "2026-09-07"]];
// rows to place by phone: [row, date, rawPlate, phone]
const MANUAL = [
  [234, "2026-09-04", "RAG 26ON", "0788313730"],
  [480, "2026-09-07", "RAJ 909",  "0784845566"],
  [121, "2026-09-02", "RAG 9907", "0788902721"],
  [395, "2026-09-06", "RAG 442",  "0795619357"],
  [509, "2026-09-07", "RAG 44E",  "0788356214"],
  [720, "2026-09-10", "RA",       "0788902721"],
  [736, "2026-09-10", "RAE",      "0784138909"],
  [742, "2026-09-10", "RA",       "0788351621"],
  [768, "2026-09-11", "RA 103",   "0788529095"],
  [836, "2026-09-11", "RA 367V",  "0791516181"],
];

initializeApp({ credential: cert(require("./service-account.json")) });
const db = getFirestore();
const g = db.collection("garages").doc(GARAGE);
const pk = (p) => String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const ph = (v) => { let d = String(v ?? "").replace(/\D/g, ""); if (d.length > 12 && d.length % 2 === 0 && d.slice(0, d.length/2) === d.slice(d.length/2)) d = d.slice(0, d.length/2); if (d.startsWith("250") && d.length === 12) d = d.slice(3); if (d.length === 9) d = "0" + d; return d; };
const lev = (a, b) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i-1][j]+1, m[i][j-1]+1, m[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return m[a.length][b.length]; };

(async () => {
  const [cs, vs] = await Promise.all([g.collection("clients").get(), g.collection("vehicles").get()]);
  const vById = new Map(vs.docs.map(d => [d.id, d]));
  const vByKey = new Map(); vs.docs.forEach(d => vByKey.set(pk(d.data().plateKey || d.data().plate || d.id.replace(/^v_/, "")), d));
  const cById = new Map(cs.docs.map(d => [d.id, d]));
  const cByPhone = new Map(); cs.docs.forEach(d => { const p = ph(d.data().phone); if (p) (cByPhone.get(p) || cByPhone.set(p, []).get(p)).push(d); });

  const edits = new Map(); // vehicleId -> Set(dates)
  const cur = (id) => { if (!edits.has(id)) edits.set(id, new Set(vById.get(id).data().visitDates || [])); return edits.get(id); };
  const backup = { vehicles: [], clients: [] }, log = [], manualLeft = [];

  console.log("=== A. UNDO WRONG MATCHES ===");
  for (const [id, d] of REMOVE) {
    if (!vById.has(id)) { console.log(`missing ${id}`); continue; }
    const s = cur(id); const had = s.delete(d);
    console.log(`${vById.get(id).data().plate}: remove ${d} -> ${had ? "removed" : "not present"} (${s.size} left)`);
  }

  console.log("\n=== B. PLACE MANUAL ROWS ===");
  for (const [row, date, plate, phone] of MANUAL) {
    const k = pk(plate), cands = cByPhone.get(ph(phone)) || [];
    let vehs = [];
    cands.forEach(c => (c.data().vehicleIds || []).forEach(id => vById.has(id) && vehs.push(vById.get(id))));
    vehs = [...new Map(vehs.map(v => [v.id, v])).values()];
    let hit = null;
    if (k.length >= 4) { const f = vehs.filter(v => { const vk = pk(v.data().plateKey || v.data().plate); return vk.startsWith(k) || k.startsWith(vk) || lev(k, vk) <= 1; }); if (f.length === 1) hit = f[0]; }
    if (!hit && k.length >= 6) { const f = [...vByKey.entries()].filter(([vk]) => lev(k, vk) <= 1); if (f.length === 1) hit = f[0][1]; }
    if (!hit && vehs.length === 1) hit = vehs[0];
    if (!hit) { manualLeft.push([row, date, plate, phone, vehs.map(v => v.data().plate)]); continue; }
    cur(hit.id).add(date);
    log.push(`row ${row} "${plate}" ${date} -> ${hit.data().plate} [${hit.id}] (owner ${cands[0] ? cands[0].data().name : "?"})`);
  }
  log.forEach(l => console.log(l));
  console.log("\n--- still manual ---");
  manualLeft.forEach(m => console.log(`row ${m[0]} ${m[1]}: "${m[2]}" | ${m[3]} | client cars: ${m[4].join(", ") || "none"}`));

  console.log("\n=== C. VEHICLE OPS ===");
  const ops = [];
  for (const [id, set] of edits) {
    const v = vById.get(id), d = v.data();
    const arr = [...set].sort();
    if (!arr.length) { console.log(`${d.plate}: would be empty, skipped`); continue; }
    if (JSON.stringify(arr) === JSON.stringify(d.visitDates || [])) continue;
    backup.vehicles.push({ id, data: d });
    ops.push({ ref: v.ref, data: { visitDates: arr, firstVisit: arr[0], lastVisit: arr[arr.length - 1], visitCount: arr.length } });
    console.log(`${d.plate}: ${(d.visitDates || []).length} -> ${arr.length} (${arr[0]}..${arr[arr.length - 1]})`);
  }

  console.log("\n=== D. NORMALIZE CLIENT PHONES ===");
  for (const c of cs.docs) {
    const raw = String(c.data().phone ?? ""), fixed = ph(raw);
    if (!fixed || raw === fixed) continue;
    backup.clients.push({ id: c.id, data: c.data() });
    ops.push({ ref: c.ref, data: { phone: fixed } });
    console.log(`${c.data().name}: "${raw}" -> ${fixed}`);
  }

  console.log("\n=== E. RESYNC CLIENT first/lastVisit FROM VEHICLES ===");
  const byClient = new Map();
  vs.docs.forEach(v => { const cid = v.data().clientId; if (!cid) return;
    const ds = edits.has(v.id) ? [...edits.get(v.id)] : (v.data().visitDates || []);
    (byClient.get(cid) || byClient.set(cid, []).get(cid)).push(...ds); });
  let nC = 0;
  for (const [cid, ds] of byClient) {
    const c = cById.get(cid); if (!c || !ds.length) continue;
    const a = [...new Set(ds)].sort();
    if (c.data().firstVisit === a[0] && c.data().lastVisit === a[a.length - 1]) continue;
    nC++;
    if (!backup.clients.find(b => b.id === cid)) backup.clients.push({ id: cid, data: c.data() });
    ops.push({ ref: c.ref, data: { firstVisit: a[0], lastVisit: a[a.length - 1] } });
    console.log(`${c.data().name}: ${c.data().firstVisit || "-"}..${c.data().lastVisit || "-"} -> ${a[0]}..${a[a.length - 1]}`);
  }

  console.log("\n=== F. FINAL INTEGRITY ===");
  let dangling = 0, orphan = 0, noDates = 0;
  cs.docs.forEach(c => (c.data().vehicleIds || []).forEach(id => { if (!vById.has(id)) { dangling++; console.log(`dangling ${id} on ${c.id} (${c.data().name})`); } }));
  vs.docs.forEach(v => { const c = cById.get(v.data().clientId); if (!c) { orphan++; console.log(`orphan vehicle ${v.id} (${v.data().plate})`); }
    else if (!(c.data().vehicleIds || []).includes(v.id)) console.log(`not linked: ${v.id} (${v.data().plate}) -> ${c.id}`);
    if (!edits.has(v.id) && !(v.data().visitDates || []).length) { noDates++; console.log(`no dates: ${v.id} (${v.data().plate})`); } });
  console.log(`clients ${cs.size} | vehicles ${vs.size} | dangling ${dangling} | orphans ${orphan} | no-date vehicles ${noDates}`);
  console.log(`ops ${ops.length} (vehicles ${edits.size}, client date resync ${nC}) | manual left ${manualLeft.length}`);
  if (!WRITE) return console.log("DRY RUN - nothing written. Re-run with --write to commit.");

  const bk = `backup-final-${Date.now()}.json`;
  fs.writeFileSync(bk, JSON.stringify(backup, null, 1));
  console.log("backup saved:", bk);
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach(o => b.set(o.ref, o.data, { merge: true }));
    await b.commit();
  }
  console.log("DONE - written.");
})().catch(e => console.error(e));
