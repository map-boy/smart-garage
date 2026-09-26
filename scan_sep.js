const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const XLSX = require("xlsx");

const FILE = "C:\\Users\\user\\Downloads\\VOLKSWAGEN SEP.xlsx";
const GARAGE = "garage-aimable-001";
const DEFAULT_DATE = new Date(Date.UTC(2026, 8, 1));

initializeApp({ credential: cert(require("./service-account.json")) });
const g = getFirestore().collection("garages").doc(GARAGE);

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const normPhone = (v) => { let d = String(v ?? "").replace(/\D/g, ""); if (d.startsWith("250") && d.length === 12) d = d.slice(3); if (d.length === 9) d = "0" + d; return d; };
const plateKey = (p) => String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const fmtPlate = (k) => k.slice(0, 3) + " " + k.slice(3);
const validPlate = (k) => /^R[A-Z]{2}\d{3}[A-Z]$/.test(k);
const validPhone = (p) => /^07\d{8}$/.test(p);
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
function mode(arr) { const m = new Map();
  for (const v of arr) { const k = v.toLowerCase(); const e = m.get(k) || { n: 0, best: v }; e.n++; if (v.length > e.best.length) e.best = v; m.set(k, e); }
  let b = null; for (const e of m.values()) if (!b || e.n > b.n) b = e; return b ? b.best : ""; }

const wb = XLSX.readFile(FILE);
const rows = [], blocks = [];
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name], map = {};
  for (const k of Object.keys(ws)) { if (k[0] === "!") continue; const c = XLSX.utils.decode_cell(k); if (c.c > 5) continue; (map[c.r] ||= {})[c.c] = ws[k].v; }
  let cur = DEFAULT_DATE, n = 0;
  const push = () => { if (n) blocks.push(`${iso(cur)}: ${n} rows`); };
  for (const r of Object.keys(map).map(Number).sort((a, b) => a - b)) {
    const x = map[r], plate = norm(x[2]);
    if (!plate) { const sd = dateInText(x[0]) || dateInText(x[1]); if (sd) { push(); n = 0; cur = sd; } continue; }
    if (/plate/i.test(plate)) continue;
    n++;
    rows.push({ row: r + 1, sheet: name, date: cur, model: model(x[1]), plate, location: norm(x[3]), name: norm(x[4]), phone: normPhone(x[5]) });
  }
  push();
}

const byPlate = new Map(), rejected = [];
for (const r of rows) { const k = plateKey(r.plate); if (!validPlate(k)) { rejected.push(r); continue; } (byPlate.get(k) || byPlate.set(k, []).get(k)).push(r); }

const plates = [];
for (const [key, rs] of byPlate) {
  const phone = mode(rs.map(r => r.phone).filter(validPhone));
  const names = rs.filter(r => !phone || r.phone === phone).map(r => r.name).filter(Boolean);
  const ds = [...new Set(rs.map(r => iso(r.date)))].sort();
  plates.push({ key, plate: fmtPlate(key), phone, name: mode(names) || mode(rs.map(r => r.name).filter(Boolean)),
    model: mode(rs.map(r => r.model).filter(Boolean)), location: mode(rs.map(r => r.location).filter(Boolean)),
    visits: rs.length, visitDates: ds, firstVisit: ds[0] || "", lastVisit: ds[ds.length - 1] || "" });
}

(async () => {
  const [cs, vs] = await Promise.all([g.collection("clients").get(), g.collection("vehicles").get()]);
  const clientByPhone = new Map();
  cs.docs.forEach(d => { const p = normPhone(d.data().phone); if (p) clientByPhone.set(p, { id: d.id, name: d.data().name }); });
  const vehByKey = new Map();
  vs.docs.forEach(d => vehByKey.set(plateKey(d.data().plateKey || d.data().plate || d.id.replace(/^v_/, "")), d));

  console.log("=== BLOCKS DETECTED ===");
  blocks.forEach(b => console.log(b));
  console.log(`\nData rows: ${rows.length} | valid plates: ${plates.length} | rejected rows: ${rejected.length}`);
  console.log(`DB now: clients ${cs.size} | vehicles ${vs.size}`);

  const newVeh = plates.filter(p => !vehByKey.has(p.key));
  const oldVeh = plates.filter(p => vehByKey.has(p.key));
  const newClientPhones = new Set(), existClientPhones = new Set(), noPhone = [];
  plates.forEach(p => { if (!p.phone) return noPhone.push(p); (clientByPhone.has(p.phone) ? existClientPhones : newClientPhones).add(p.phone); });

  console.log(`\nNew vehicles: ${newVeh.length} | already in DB: ${oldVeh.length}`);
  console.log(`New clients: ${newClientPhones.size} | existing clients touched: ${existClientPhones.size} | plates with no usable phone: ${noPhone.length}`);

  console.log("\n=== 1. NEW CLIENTS (sample 40) ===");
  [...newClientPhones].slice(0, 40).forEach(ph => { const ps = plates.filter(p => p.phone === ph); console.log(`${mode(ps.map(p => p.name).filter(Boolean)) || "(no name)"} | ${ph} | ${ps.map(p => `${p.plate} x${p.visits} ${p.firstVisit}..${p.lastVisit}`).join(", ")}`); });

  console.log("\n=== 2. EXISTING CLIENTS, NEW CARS ===");
  newVeh.filter(p => p.phone && clientByPhone.has(p.phone)).forEach(p => console.log(`${clientByPhone.get(p.phone).name} (${p.phone}) + ${p.plate} [${p.firstVisit}]`));

  console.log("\n=== 3. EXISTING VEHICLES -> VISIT MERGE ===");
  oldVeh.forEach(p => { const d = vehByKey.get(p.key).data(); const have = new Set(d.visitDates || []); const add = p.visitDates.filter(x => !have.has(x));
    console.log(`${p.plate} | db ${have.size} dates / count ${d.visitCount ?? "none"} -> +${add.length} new (${add.slice(0, 5).join(",")}${add.length > 5 ? "..." : ""})`); });

  console.log("\n=== 4. NO PHONE ===");
  noPhone.forEach(p => console.log(`${p.plate} | ${p.name} | x${p.visits}`));

  console.log("\n=== 5. REJECTED PLATES (fix manually) ===");
  rejected.forEach(r => console.log(`row ${r.row} ${iso(r.date)}: "${r.plate}" | ${r.name} | ${r.phone}`));
})().catch(e => console.error(e));
