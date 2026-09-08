import { useState, FormEvent } from "react";
import { collection, addDoc, serverTimestamp, query, where, getDocs, limit } from "firebase/firestore";
import { Car, Check } from "lucide-react";
import { db, normalisePlate } from "../firebase";
import { useAuth } from "../auth";

const REASONS = ["Service", "Repair", "Car wash", "Diagnostics", "Bodywork", "Collection", "Other"];

export function CheckIn({ onDone }: { onDone: () => void }) {
  const { profile, online } = useAuth();
  const [plate, setPlate] = useState("");
  const [make, setMake] = useState("");
  const [colour, setColour] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile?.garageId) return;
    const norm = normalisePlate(plate);
    if (norm.length < 3) { setErr("Enter the number plate."); return; }

    setBusy(true); setErr(null);
    try {
      // Link to a vehicle already on file when we can, so the admin sees the
      // history immediately. Best-effort only: at the gate, with no signal,
      // recording the arrival matters far more than resolving the link.
      let vehicleId: string | undefined;
      let clientId: string | undefined;
      try {
        const found = await getDocs(query(
          collection(db, "garages", profile.garageId, "vehicles"),
          where("plate", "==", plate.toUpperCase().trim()), limit(1)));
        if (!found.empty) {
          vehicleId = found.docs[0].id;
          clientId = found.docs[0].data().clientId;
        }
      } catch { /* offline or denied - carry on without the link */ }

      await addDoc(collection(db, "garages", profile.garageId, "arrivals"), {
        plate: plate.toUpperCase().trim(),
        plateKey: norm,
        make: make.trim() || undefined,
        colour: colour.trim() || undefined,
        driverName: driverName.trim() || undefined,
        driverPhone: driverPhone.trim() || undefined,
        reason, notes: notes.trim() || undefined,
        vehicleId, clientId,
        status: "waiting",
        arrivedAt: serverTimestamp(),
        loggedBy: profile.uid,
        loggedByName: profile.displayName ?? "Reception",
      });

      setDone(plate.toUpperCase().trim());
      setPlate(""); setMake(""); setColour(""); setDriverName(""); setDriverPhone(""); setNotes("");
      setTimeout(() => { setDone(null); onDone(); }, 1600);
    } catch (e: any) {
      setErr(e?.message ?? "Could not save.");
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="main" style={{ justifyContent: "center", alignItems: "center", gap: 18 }}>
        <div style={{ width: 84, height: 84, borderRadius: 999, background: "#10b98122", display: "grid", placeItems: "center" }}>
          <Check size={40} color="#10b981" />
        </div>
        <div className="ok" style={{ width: "100%" }}>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2 }}>{done}</div>
          <div style={{ marginTop: 6, fontWeight: 600 }}>
            {online ? "Admin has been notified." : "Saved on this phone. It will reach the admin when you have signal."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className="main" onSubmit={submit}>
      <div className="f plate">
        <label>Number plate</label>
        <input value={plate} onChange={(e) => setPlate(e.target.value)}
          placeholder="RAB 123 C" autoCapitalize="characters" autoCorrect="off" required />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="f"><label>Make / model</label>
          <input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota Vitz" /></div>
        <div className="f"><label>Colour</label>
          <input value={colour} onChange={(e) => setColour(e.target.value)} placeholder="White" /></div>
      </div>

      <div className="f">
        <label>Reason for visit</label>
        <div className="chips">
          {REASONS.map((r) => (
            <button type="button" key={r} className={"chip" + (reason === r ? " on" : "")}
              onClick={() => setReason(r)}>{r}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="f"><label>Driver name</label>
          <input value={driverName} onChange={(e) => setDriverName(e.target.value)} /></div>
        <div className="f"><label>Phone</label>
          <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)}
            inputMode="tel" placeholder="+250..." /></div>
      </div>

      <div className="f"><label>Notes</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything the workshop should know" /></div>

      {err && <div className="err">{err}</div>}

      <button className="btn" disabled={busy}>
        <Car size={17} style={{ verticalAlign: -4, marginRight: 8 }} />
        {busy ? "Saving..." : "Check vehicle in"}
      </button>
    </form>
  );
}