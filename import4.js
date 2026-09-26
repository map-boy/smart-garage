const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const XLSX = require("xlsx");
const crypto = require("crypto");

const FILE = "C:\\Users\\user\\Downloads\\VOLKSWAGEN SEP.xlsx";
const GARAGE = "garage-aimable-001";
const WRITE = process.argv.includes("--write");
const DEFAULT_DATE = new Date(Date.UTC(2026, 8, 1)); // rows before first separator (title says SEP 2026, first separator is 2/9)

initializeApp({ credential: cert(require("./service-account.json")) });
const db = getFirestore();
const g = db.collection("garages").doc(GARAGE);

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const normPhone = (v) => {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("250") && d.length === 12) d = d.slice(3);
  if (d.length === 9) d = "0" + d;
  return d;
};
const plateKey = (p) => String(p).toUpperCase().replace(/[^A-Z0-9]/g, "");
const fmtPlate = (k) => k.slice(0, 3) + " " + k.slice(3);
const validPlate = (k) => /^R[A-Z]{2}\d{3}[A-Z]$/.test(k);
const validPhone = (p) => /^07\d{8}$/.test(p);
const model = (s) => {
  s = norm(s);
  if (/^(teramont|termont)$/i.test(s)) return "Teramont";
  if (/^t-?c(ross)?$/i.test(s)) return "T-Cross";
  if (/^virtus$/i.test(s)) return "Virtus";
  if (/^e-?golf$/i.test(s)) return "e-Golf";
  return s;
};
function mode(arr) {
  const m = new Map();
  for (const v of arr) {
    const k = v.toLowerCase();
    const e = m.get(k) || { n: 0, best: v };
    e.n++; if (v.length > e.best.length) e.best = v;
    m.set(k, e);
  }
  let b = null;
  for (const e of m.values()) if (!b || e.n > b.n) b = e;
  return b ? b.best : "";
}
const iso = (d) => d.toISOString().slice(0, 10);
// separator rows look like "VOLKSWAGEN 3/9/2026" -> D/M/YYYY
const dateInText = (s) => {
  const m = String(s ?? "").match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(20\d{2})/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
};

const wb = XLSX.readFile(FILE);
const rows = [], separators = [];
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const map = {};
  for (const k of Object.keys(ws)) {
    if (k[0] === "!") continue;
    const c = XLSX.utils.decode_cell(k);
    if (c.c > 5) continue;
    (map[c.r] ||= {})[c.c] = ws[k].v;
  }
  let cur = DEFAULT_DATE, assumed = true, prev = null;
  for (const r of Object.keys(map).map(Number).sort((a, b) => a - b)) {
    const x = map[r];
    const plate = norm(x[2]);
    if (!plate) {
      const sd = dateInText(x[0]) || dateInText(x[1]);
      if (sd) {
        separators.push(`${name} row ${r + 1}: ${iso(sd)}${prev && sd < prev ? "  <-- WARNING: goes backwards" : ""}`);
        cur = sd; assumed = false; prev = sd;
      }
      continue;
    }
    if (/plate/i.test(plate)) continue;
    rows.push({ row: r + 1, sheet: name, date: cur, assumed, model: model(x[1]), plate, location: norm(x[3]), name: norm(x[4]), phone: normPhone(x[5]) });
  }
}

const byPlate = new Map(), rejected = [];
for (const r of rows) {
  const k = plateKey(r.plate);
  if (!validPlate(k)) { rejected.push(r); continue; }
  if (!byPlate.has(k)) byPlate.set(k, []);
  byPlate.get(k).push(r);
}

const plates = [];
for (const [key, rs] of byPlate) {
  const phone = mode(rs.map(r => r.phone).filter(validPhone));
  const names = rs.filter(r => !phone || r.phone === phone).map(r => r.name).filter(Boolean);
  const ds = rs.map(r => r.date).sort((a, b) => a - b);
  plates.push({
    key, plate: fmtPlate(key), phone,
    name: mode(names) || mode(rs.map(r => r.name).filter(Boolean)),
    model: mode(rs.map(r => r.model).filter(Boolean)),
    location: mode(rs.map(r => r.location).filter(Boolean)),
    visits: rs.length,
    firstVisit: iso(ds[0]),
    lastVisit: iso(ds[ds.length - 1]),
    visitDates: [...new Set(ds.map(iso))],
  });
}
const byPhone = new Map();
for (const p of plates) {
  const k = p.phone || "nophone_" + p.key;
  if (!byPhone.has(k)) byPhone.set(k, []);
  byPhone.get(k).push(p);
}

(async () => {
  const [cs, vs] = await Promise.all([g.collection("clients").get(), g.collection("vehicles").get()]);
  const clientByPhone = new Map();
  cs.docs.forEach(d => { const p = normPhone(d.data().phone); if (p) clientByPhone.set(p, { id: d.id, name: d.data().name }); });
  const vehKeys = new Set(vs.docs.map(d => plateKey(d.data().plateKey || d.data().plate || d.id.replace(/^v_/, ""))));

  const ops = [], lines = [];
  let nNewClients = 0, nAddExisting = 0, nNewVeh = 0, nSkipVeh = 0;

  for (const [pk, group] of byPhone) {
    const ex = pk.startsWith("nophone_") ? null : clientByPhone.get(pk);
    const fresh = group.filter(p => !vehKeys.has(p.key));
    nSkipVeh += group.length - fresh.length;
    if (!fresh.length) continue;
    const cid = ex ? ex.id : crypto.randomUUID();
    const name = mode(group.map(p => p.name).filter(Boolean));
    const vids = fresh.map(p => "v_" + p.key);
    const first = fresh.map(p => p.firstVisit).sort()[0];
    const last = fresh.map(p => p.lastVisit).sort().slice(-1)[0];
    for (const p of fresh) {
      vehKeys.add(p.key); nNewVeh++;
      ops.push({ ref: g.collection("vehicles").doc("v_" + p.key), data: {
        clientId: cid, color: "", fuelType: "Petrol", plateKey: p.key, year: "", model: p.model, plate: p.plate, make: "", mileage: "",
        firstVisit: p.firstVisit, lastVisit: p.lastVisit, visitCount: p.visits, visitDates: p.visitDates } });
    }
    if (ex) {
      nAddExisting++;
      ops.push({ ref: g.collection("clients").doc(cid), data: { vehicleIds: FieldValue.arrayUnion(...vids) }, merge: true });
      lines.push(`ADD-TO-EXISTING  ${ex.name} (${pk}) + ${fresh.map(p => `${p.plate} [${p.firstVisit}${p.firstVisit !== p.lastVisit ? ".." + p.lastVisit : ""} x${p.visits}]`).join(", ")}`);
    } else {
      nNewClients++;
      ops.push({ ref: g.collection("clients").doc(cid), data: {
        createdAt: new Date(first + "T00:00:00.000Z").toISOString(),
        firstVisit: first, lastVisit: last,
        issue: "", phone: group[0].phone, vehiclePlate: fresh[0].plate, name,
        vehicleModel: fresh[0].model, location: fresh[0].location, source: "excel-import", vehicleIds: vids } });
      if (group[0].phone) clientByPhone.set(group[0].phone, { id: cid, name });
      lines.push(`NEW  ${name || "(no name)"} | ${group[0].phone || "(no phone)"} | ${first}..${last} | ${fresh.map(p => `${p.plate} x${p.visits}`).join(", ")}`);
    }
  }

  const perDate = {};
  rows.forEach(r => { const k = iso(r.date) + (r.assumed ? " (ASSUMED, before first separator)" : ""); perDate[k] = (perDate[k] || 0) + 1; });

  console.log("=== DATE SEPARATORS FOUND ===");
  separators.forEach(s => console.log(s));
  console.log("\n=== ROWS PER DATE ===");
  Object.keys(perDate).sort().forEach(k => console.log(`${k}: ${perDate[k]}`));
  console.log(`\nRows: ${rows.length} | assumed-date rows: ${rows.filter(r => r.assumed).length}`);
  console.log(`Unique valid plates: ${plates.length} | rejected rows: ${rejected.length}`);
  console.log(`New clients: ${nNewClients} | existing clients getting new cars: ${nAddExisting} | new vehicles: ${nNewVeh} | vehicles already in DB: ${nSkipVeh}`);
  console.log("\n=== PLANNED ===");
  lines.forEach(l => console.log(l));
  console.log("\n=== REJECTED (bad plate, fix manually) ===");
  rejected.forEach(r => console.log(`row ${r.row}: "${r.plate}" | ${r.name} | ${r.phone} | ${iso(r.date)}`));
  console.log(`\nops: ${ops.length}`);
  if (!WRITE) return console.log("DRY RUN - nothing written. Re-run with --write to commit.");

  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach(o => o.merge ? b.set(o.ref, o.data, { merge: true }) : b.set(o.ref, o.data));
    await b.commit();
  }
  console.log("DONE - written.");
})().catch(e => console.error(e));
