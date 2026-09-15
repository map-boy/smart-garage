import {
  doc,
  setDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb, listDeviceSessions } from "./pairing";
import {
  queuePending,
  queueMarkSynced,
  checkInternet,
  logCrash,
  type QueueRow,
} from "./db";

const REMOTE_COLLECTION: Record<QueueRow["table_name"], string> = {
  clients: "clients",
  stock_items: "stock",
};

async function pushRow(row: QueueRow, garageId: string): Promise<void> {
  const db = getFirebaseDb();
  const data = JSON.parse(row.payload);
  const collName = REMOTE_COLLECTION[row.table_name];
  const ref = doc(db, "garages", garageId, collName, row.row_id);

  await setDoc(
    ref,
    { ...data, syncedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function flushSyncQueue(): Promise<{ synced: number; failed: number; reason?: string }> {
  const sessions = await listDeviceSessions();
  const session = sessions[0];
  if (!session) {
    return { synced: 0, failed: 0, reason: "not_paired" };
  }

  const online = await checkInternet();
  if (!online) {
    return { synced: 0, failed: 0, reason: "offline" };
  }

  const pending = await queuePending();
  let synced = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      await pushRow(row, session.garage_id);
      await queueMarkSynced(row.id, row.table_name, row.row_id);
      synced++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      await logCrash("sync", `Failed to sync ${row.table_name}/${row.row_id}: ${message}`);
    }
  }

  return { synced, failed };
}

export function startSyncLoop(intervalMs = 15000): () => void {
  const id = setInterval(() => {
    flushSyncQueue().catch((err) => {
      logCrash("sync-loop", err instanceof Error ? err.message : String(err));
    });
  }, intervalMs);
  return () => clearInterval(id);
}