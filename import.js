const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const XLSX = require("xlsx");
const crypto = require("crypto");

const FILE = "C:\\Users\\user\\Downloads\\VOLKSWAGEN SEP.xlsx";
const GARAGE = "garage-aimable-001";
const WRITE = process.argv.includes("--write");

initializeApp({ credential: cert(require("./service-account.json")) });
const db = getFirestore();
const g = db.collection("garages").doc(GARAGE);

const normPhone = (v) => {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("250") && d.length === 12) d = d.slice(3);
  if (d.length === 9) d = "0" + d;
  return d;
};
const plateKey = (p) => String(p).toUpperCase().replace(/[^A-Z0-9]/g, "");

const wb = XLSX.readFile(FILE);
const rows = [];
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const map = {};
  for (const k of Object.keys(ws)) {
    if (k[0] === "!") continue;
    const c = XLSX.utils.decode_cell(k);
    if (c.c > 5) continue;
    (map[c.r] ||= {})[c.c] = ws[k].v;
  }
  for (const r of Object.keys(map).map(Number).sort((a, b) => a - b)) {
    const x = map[r];
    const plate = String(x[2] ?? "").trim();
    if (!plate || /plate/i.test(plate)) continue;
    rows.push({
      sheet: name,
      model: String(x[1] ?? "").trim(),
      plate,
      location: String(x[3] ?? "").trim(),
      name: String(x[4] ?? "").trim(),
      phone: normPhone(x[5]),
    });
  }
}
console.log(`Parsed ${rows.length} rows`);

(async () => {
  const [cs, vs] = await Promise.all([g.collection("clients").get(), g.collection("vehicles").get()]);
  const clientByPhone = new Map();
  cs.docs.forEach(d => { const p = normPhone(d.data().phone); if (p) clientByPhone.set(p, d.id); });
  const vehIds = new Set(vs.docs.map(d => d.id));

  const newClients = new Map();
  const ops = [];
  const report = [];
  const now = new Date().toISOString();

  for (const r of rows) {
    const key = plateKey(r.plate);
    const vid = "v_" + key;
    let cid = r.phone ? clientByPhone.get(r.phone) : null;
    let clientNew = false;
    if (!cid) {
      const ck = r.phone || "nophone_" + key;
      if (newClients.has(ck)) cid = newClients.get(ck).id;
      else {
        cid = crypto.randomUUID();
        newClients.set(ck, { id: cid });
        clientNew = true;
        ops.push({ ref: g.collection("clients").doc(cid), data: {
          createdAt: now, issue: "", phone: r.phone, vehiclePlate: r.plate, name: r.name,
          vehicleModel: r.model, location: r.location, source: "excel-import", vehicleIds: [vid],
        }});
        if (r.phone) clientByPhone.set(r.phone, cid);
      }
    }
    let vStatus = "SKIP (exists)";
    if (!vehIds.has(vid)) {
      vehIds.add(vid);
      vStatus = "NEW";
      ops.push({ ref: g.collection("vehicles").doc(vid), data: {
        clientId: cid, color: "", fuelType: "Petrol", plateKey: key, year: "", model: r.model,
        plate: r.plate, make: "", mileage: "",
      }});
      if (!clientNew) ops.push({ ref: g.collection("clients").doc(cid), data: { vehicleIds: FieldValue.arrayUnion(vid) }, merge: true });
    }
    report.push({ client: clientNew ? "NEW" : "existing", vehicle: vStatus, name: r.name, phone: r.phone, plate: r.plate, model: r.model, location: r.location });
  }

  console.table(report);
  console.log(`Clients to create: ${newClients.size} | ops: ${ops.length}`);
  if (!WRITE) return console.log("\nDRY RUN - nothing written. Re-run with --write to commit.");

  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach(o => o.merge ? b.set(o.ref, o.data, { merge: true }) : b.set(o.ref, o.data));
    await b.commit();
  }
  console.log("DONE - written.");
})().catch(e => console.error(e));
