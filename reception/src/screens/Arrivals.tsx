import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth";
import { Arrival, STATUS_LABEL } from "../types";

export function Arrivals() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Arrival[]>([]);

  useEffect(() => {
    if (!profile?.garageId) return;
    // Capped: reception only ever needs today's gate, not the whole history.
    return onSnapshot(
      query(collection(db, "garages", profile.garageId, "arrivals"),
        orderBy("arrivedAt", "desc"), limit(50)),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Arrival, "id">) }))),
      () => { /* offline: keep what the cache gave us */ });
  }, [profile?.garageId]);

  if (!rows.length) return <div className="main"><p className="empty">No vehicles logged yet today.</p></div>;

  return (
    <div className="main">
      {rows.map((a) => {
        const t = a.arrivedAt?.toDate?.();
        return (
          <div className="card" key={a.id}>
            <div>
              <div className="pl">{a.plate}</div>
              <div className="sub">
                {[a.make, a.colour, a.reason].filter(Boolean).join(" \u00b7 ")}
                {t ? " \u00b7 " + t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : " \u00b7 sending..."}
              </div>
            </div>
            <span className={"tag " + a.status}>{STATUS_LABEL[a.status] ?? a.status}</span>
          </div>
        );
      })}
    </div>
  );
}