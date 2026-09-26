const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
initializeApp({ credential: cert(require("./service-account.json")) });
const g = getFirestore().collection("garages").doc("garage-aimable-001");
const pk = (p) => String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const ph = (v) => { let d = String(v ?? "").replace(/\D/g, ""); if (d.startsWith("250") && d.length === 12) d = d.slice(3); if (d.length === 9) d = "0" + d; return d; };
(async () => {
  const [cs, vs] = await Promise.all([g.collection("clients").get(), g.collection("vehicles").get()]);
  const vById = new Map(vs.docs.map(d => [d.id, d]));
  const cById = new Map(cs.docs.map(d => [d.id, d]));

  console.log("=== 1. DANGLING client.vehicleIds ===");
  cs.docs.forEach(c => (c.data().vehicleIds || []).forEach(v => {
    if (vById.has(v)) return;
    const key = pk(v.replace(/^v_/, ""));
    const alt = vs.docs.filter(x => pk(x.data().plateKey || x.data().plate) === key).map(x => x.id);
    console.log(`client ${c.id} (${c.data().name} | ${c.data().phone} | source=${c.data().source || "none"}) -> missing "${v}" | vehicles with same plate: ${JSON.stringify(alt)}`);
    console.log("   client doc:", JSON.stringify(c.data()));
  }));

  console.log("\n=== 2. VEHICLES NOT LISTED IN THEIR CLIENT's vehicleIds ===");
  let n2 = 0;
  vs.docs.forEach(v => { const c = cById.get(v.data().clientId); if (c && !(c.data().vehicleIds || []).includes(v.id)) { n2++; console.log(`${v.id} (${v.data().plate}) -> client ${c.id} (${c.data().name})`); } });
  console.log(`count: ${n2}`);

  console.log("\n=== 3. DUPLICATE PLATES ACROSS VEHICLE DOCS ===");
  const byKey = new Map();
  vs.docs.forEach(v => { const k = pk(v.data().plateKey || v.data().plate || v.id.replace(/^v_/, "")); (byKey.get(k) || byKey.set(k, []).get(k)).push(v.id); });
  let n3 = 0; byKey.forEach((ids, k) => { if (ids.length > 1) { n3++; console.log(k, JSON.stringify(ids)); } });
  console.log(`count: ${n3}`);

  console.log("\n=== 4. DUPLICATE CLIENT PHONES ===");
  const byPh = new Map();
  cs.docs.forEach(c => { const p = ph(c.data().phone); if (!p) return; (byPh.get(p) || byPh.set(p, []).get(p)).push(`${c.id}:${c.data().name}:${c.data().source || "app"}`); });
  let n4 = 0; byPh.forEach((a, p) => { if (a.length > 1) { n4++; console.log(p, JSON.stringify(a)); } });
  console.log(`count: ${n4}`);

  console.log("\n=== 5. PRE-EXISTING VEHICLES (no visit dates) ===");
  vs.docs.filter(v => v.data().visitCount === undefined).forEach(v => console.log(`${v.id} | ${v.data().plate} | ${v.data().model} | client ${v.data().clientId}`));
})().catch(e => console.error(e));
