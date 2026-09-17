import {
  doc,
  collection,
  setDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  writeBatch,
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
  visits: "visits",
};

/**
 * The admin app classifies every ledger line by a fixed reason. The desk
 * records why in plain words, so the translation happens here rather than
 * changing what the Rust side writes into its own SQLite.
 */
const MOVEMENT_REASON: Record<string, string> = {
  "opening balance": "received",
  "added": "received",
  "taken out": "issued_to_vehicle",
  "item removed": "written_off",
};

/**
 * Local columns are snake_case; the admin app reads camelCase and a different
 * vocabulary again (`quantity`, not `qty`; `unitCost`, not `unit_price`).
 *
 * Writes go out with { merge: true }, so this only ever sends fields this app
 * owns. Fields the admin maintains - partNumber, reorderLevel, supplier,
 * email, vehicleIds - are deliberately absent: sending them as empty strings
 * would blank them on every sync.
 */
function toRemote(table: SyncTable, d: Record<string, any>): Record<string, any> {
  switch (table) {
    case "stock_items":
      return {
        name: d.name,
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

    case "stock_movements": {
      const reason = MOVEMENT_REASON[String(d.reason)] ?? "count_adjustment";
      // The rule on this collection requires delta to be a number and partId a
      // string, so both are coerced rather than passed through. The rest of the
      // shape matches what applyStockDelta writes on the admin side, field for
      // field, or the ledger renders half-empty rows.
      return {
        partId: String(d.part_id),
        partName: d.part_name ?? "",
        partNumber: null,
        delta: Number(d.delta),
        balanceAfter: Number(d.qty_after),
        reason,
        plate: null,
        vehicleId: null,
        arrivalId: null,
        jobId: null,
        note: d.reason ?? null,
        byName: "Garage Desk",
        byRole: "store_keeper",
        at: serverTimestamp(),
        atLocal: d.created_at,
        source: "garage-desk",
      };
    }

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

    case "visits":
      return {
        clientId: d.client_id ?? null,
        name: d.name,
        phone: d.phone ?? "",
        vehiclePlate: d.vehicle_plate ?? "",
        vehicleModel: d.vehicle_model ?? "",
        location: d.location ?? "",
        visitDate: d.visit_date,
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
    // The ledger is append-only by rule; a delete there would be refused and
    // would block every row queued behind it, forever.
    if (row.table_name === "stock_movements") return;
    await deleteDoc(ref);
    return;
  }

  const raw = JSON.parse(row.payload);
  const data = toRemote(row.table_name, raw);

  // A ledger line and the quantity it explains land together or not at all.
  // This is also the only place a quantity moves: by increment, on the server,
  // so a change made here and a part issued on the admin side at the same
  // moment both survive instead of one overwriting the other.
  if (row.table_name === "stock_movements") {
    const delta = Number(raw.delta);
    const batch = writeBatch(db);
    batch.set(doc(collection(db, "garages", GARAGE_ID, "stockMovements"), row.row_id), data);
    // An opening balance is already carried by the create that precedes it.
    // Incrementing here too would double the first count on the shelf.
    if (delta && raw.reason !== "opening balance") {
      batch.set(
        doc(db, "garages", GARAGE_ID, "stock", String(raw.part_id)),
        { quantity: increment(delta), updatedAt: raw.created_at },
        { merge: true }
      );
    }
    await batch.commit();
    return;
  }

  // Creating a part seeds its count; updating one never touches it.
  if (row.table_name === "stock_items" && row.op === "create") {
    await setDoc(
      ref,
      { ...data, quantity: Number(raw.qty ?? 0), syncedAt: serverTimestamp() },
      { merge: true }
    );
    return;
  }

  await setDoc(ref, { ...data, syncedAt: serverTimestamp() }, { merge: true });
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

export function startSyncLoop(intervalMs = 4000): () => void {
  const id = setInterval(() => {
    flushSyncQueue().catch((err) => {
      logCrash("sync-loop", err instanceof Error ? err.message : String(err));
    });
  }, intervalMs);
  return () => clearInterval(id);
}