import {
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb, ensureStaffProfile, GARAGE_ID } from "./pairing";
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

async function pushRow(row: QueueRow): Promise<void> {
  const db = getFirebaseDb();
  const collName = REMOTE_COLLECTION[row.table_name];
  const ref = doc(db, "garages", GARAGE_ID, collName, row.row_id);

  if (row.op === "delete") {
    await deleteDoc(ref);
    return;
  }

  const data = JSON.parse(row.payload);
  await setDoc(
    ref,
    { ...data, syncedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function flushSyncQueue(): Promise<{ synced: number; failed: number; reason?: string }> {
  const online = await checkInternet();
  if (!online) {
    return { synced: 0, failed: 0, reason: "offline" };
  }

  try {
    await ensureStaffProfile();
  } catch {
    return { synced: 0, failed: 0, reason: "auth_failed" };
  }

  const pending = await queuePending();
  let synced = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      await pushRow(row);
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
