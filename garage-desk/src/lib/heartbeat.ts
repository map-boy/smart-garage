import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function startHeartbeat(garageId: string, deviceId: string, intervalMs = 30000) {
  stopHeartbeat();
  const ref = doc(db, "garages", garageId, "devices", deviceId);
  const tick = () => updateDoc(ref, { lastSeenAt: serverTimestamp() }).catch(() => {});
  tick();
  heartbeatTimer = setInterval(tick, intervalMs);
}

export function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}
