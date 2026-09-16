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
  type SyncTable,
} from "./db";

const REMOTE_COLLECTION: Record<SyncTable, string> = {
  clients: "clients",
  stock_items: "stock",
  stock_groups: "stockGroups",
  stock_movements: "stockMovements",
};

/**
 * Local column names are snake_case; the boss dashboard reads camelCase and a
 * different vocabulary again (`quantity`, not `qty`; `unitCost`, not
 * `unit_price`). Translating here is what makes a row written on this desk
 * actually render on the dashboard.
 *
 * Writes go out with { merge: true }, so this only ever sends fields this app
 * owns. Fields the boss maintains on their side - partNumber, reorderLevel,
 * supplier, email, vehicleIds - are deliberately absent: including them as
 * empty strings would blank them on every sync.
 */
function toRemote(table: SyncTable, d: Record<string, any>): Record<string, any> {
  switch (table) {
    case "stock_items":
      return {
        name: d.name,
        quantity: d.qty,
        unitCost: d.unit_price,
        groupId: d.group_id ?? null,
        groupName: d.group_name ?? "General",
        updatedAt: d.updated_at,
        source: "garage-desk",
      };

    case "stock_groups":
      return {
        name: d.name,
        createdAt: d.created_at,
        source: "garage-desk",
      };

    case "stock_movements":
      // The security rule on this collection requires delta to be a number and
      // partId to be a string, so both are coerced rather than passed through.
      return {
        partId: String(d.part_id),
        partName: d.part_name ?? "",
        delta: Number(d.delta),
        qtyAfter: Number(d.qty_after),
        reason: d.reason ?? "",
        createdAt: d.created_at,
        source: "garage-desk",
      };

    case "clients":
      return {
        name: d.name,
        phone: d.phone ?? "",
        vehiclePlate: d.vehicle_plate ?? "",
        vehicleModel: d.vehicle_model ?? "",
        location: d.location ?? "",
        issue: d.issue ?? "",
        createdAt: d.created_at,
        source: "garage-desk",
      };

    default:
      return d;
  }
}

async function pushRow(row: QueueRow): Promise<void> {
  const db = getFirebaseDb();
  const collName = REMOTE_COLLECTION[row.table_name];
  if (!collName) throw new Error(`No remote collection mapped for ${row.table_name}`);

  const ref = doc(db, "garages", GARAGE_ID, collName, row.row_id);

  if (row.op === "delete") {
    // The stock ledger is append-only by rule; a delete there would be rejected
    // and would block the queue behind it forever.
    if (row.table_name === "stock_movements") return;
    await deleteDoc(ref);
    return;
  }

  const data = toRemote(row.table_name, JSON.parse(row.payload));
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