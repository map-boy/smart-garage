const fs = require("fs");

function patch(file, edits) {
  let text = fs.readFileSync(file, "utf8");
  for (const [label, oldStr, newStr] of edits) {
    const count = text.split(oldStr).length - 1;
    if (count !== 1) throw new Error(`${file}: anchor "${label}" matched ${count} times (need 1) - aborting, nothing written`);
    text = text.replace(oldStr, newStr);
  }
  fs.writeFileSync(file, text, "utf8");
  console.log(`patched ${file} (${edits.length} edit(s))`);
}

// ---------- src-tauri/src/main.rs ----------
patch("src-tauri/src/main.rs", [
  ["insert new commands + register them", 
`generate_handler![
            verify_login,`,
`#[tauri::command]
fn upsert_remote_clients(db: State<Db>, rows: Vec<Client>) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut n = 0usize;
    for c in rows {
        conn.execute(
            "INSERT INTO clients (id, name, phone, vehicle_plate, vehicle_model, location, issue, created_at, synced)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, phone=excluded.phone, vehicle_plate=excluded.vehicle_plate,
               vehicle_model=excluded.vehicle_model, location=excluded.location,
               issue=excluded.issue, created_at=excluded.created_at",
            params![c.id, c.name, c.phone, c.vehicle_plate, c.vehicle_model, c.location, c.issue, c.created_at],
        ).map_err(|e| e.to_string())?;
        n += 1;
    }
    Ok(n)
}

#[tauri::command]
fn upsert_remote_visits(db: State<Db>, rows: Vec<Visit>) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut n = 0usize;
    for v in rows {
        conn.execute(
            "INSERT INTO visits (id, client_id, name, phone, vehicle_plate, vehicle_model, location, issue, visit_date, created_at, synced)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1)
             ON CONFLICT(id) DO UPDATE SET
               client_id=excluded.client_id, name=excluded.name, phone=excluded.phone,
               vehicle_plate=excluded.vehicle_plate, vehicle_model=excluded.vehicle_model,
               location=excluded.location, issue=excluded.issue, visit_date=excluded.visit_date,
               created_at=excluded.created_at",
            params![v.id, v.client_id, v.name, v.phone, v.vehicle_plate, v.vehicle_model, v.location, v.issue, v.visit_date, v.created_at],
        ).map_err(|e| e.to_string())?;
        n += 1;
    }
    Ok(n)
}

fn main_placeholder_anchor_unused() {}

generate_handler![
            verify_login,
            upsert_remote_clients,
            upsert_remote_visits,`],
]);

// ---------- src/db.ts ----------
patch("src/db.ts", [
  ["append pull-related exports",
`export function checkInternet(): Promise<boolean> {
  return invoke("check_internet");
}
export function exportReport(kind: string, date: string): Promise<string> {
  return invoke("export_report", { kind, date });
}`,
`export function checkInternet(): Promise<boolean> {
  return invoke("check_internet");
}
export function exportReport(kind: string, date: string): Promise<string> {
  return invoke("export_report", { kind, date });
}

/* ---- remote pull (merge Firestore data into the local db, already marked synced) ---- */

export function upsertRemoteClients(rows: Client[]): Promise<number> {
  return invoke("upsert_remote_clients", { rows });
}

export function upsertRemoteVisits(rows: Visit[]): Promise<number> {
  return invoke("upsert_remote_visits", { rows });
}`],
]);

// ---------- src/sync.ts ----------
patch("src/sync.ts", [
  ["widen the ./db import",
`import {
  queuePending,
  queueMarkSynced,
  checkInternet,
  logCrash,
  type QueueRow,
  type SyncTable,
} from "./db";`,
`import {
  queuePending,
  queueMarkSynced,
  checkInternet,
  logCrash,
  upsertRemoteClients,
  upsertRemoteVisits,
  type QueueRow,
  type SyncTable,
  type Client,
  type Visit,
} from "./db";`],
  ["append pullFromRemote after startSyncLoop",
`export function startSyncLoop(intervalMs = 4000): () => void {
  const id = setInterval(() => {
    flushSyncQueue().catch((err) => {
      logCrash("sync-loop", err instanceof Error ? err.message : String(err));
    });
  }, intervalMs);
  return () => clearInterval(id);
}`,
`export function startSyncLoop(intervalMs = 4000): () => void {
  const id = setInterval(() => {
    flushSyncQueue().catch((err) => {
      logCrash("sync-loop", err instanceof Error ? err.message : String(err));
    });
  }, intervalMs);
  return () => clearInterval(id);
}

/**
 * Pulls clients and vehicle visit history from Firestore and merges them into
 * the local SQLite db. Rows are inserted straight into clients/visits
 * (synced = 1) without touching sync_queue, so nothing gets pushed back to
 * Firestore and this can never create a push/pull loop. Visit ids are
 * deterministic (remote_<vehicleDocId>_<date>), so running this again just
 * updates the same rows instead of duplicating them.
 */
export async function pullFromRemote(): Promise<{ clients: number; visits: number }> {
  const online = await checkInternet();
  if (!online) throw new Error("Offline - cannot update from database.");

  await ensureStaffProfile();
  const db = getFirebaseDb();

  const clientSnap = await getDocs(collection(db, "garages", GARAGE_ID, "clients"));
  const clientById = new Map<string, any>();
  const clientRows: Client[] = [];
  clientSnap.forEach((d) => {
    const c = d.data();
    clientById.set(d.id, c);
    clientRows.push({
      id: d.id,
      name: c.name ?? "",
      phone: c.phone ?? "",
      vehicle_plate: c.vehiclePlate ?? "",
      vehicle_model: c.vehicleModel ?? "",
      location: c.location ?? "",
      issue: c.issue ?? "",
      created_at: c.createdAt ?? new Date().toISOString(),
      synced: true,
    });
  });

  const vehicleSnap = await getDocs(collection(db, "garages", GARAGE_ID, "vehicles"));
  const visitRows: Visit[] = [];
  vehicleSnap.forEach((d) => {
    const v = d.data();
    const dates: string[] = Array.isArray(v.visitDates) ? v.visitDates : [];
    if (!dates.length) return;
    const client = v.clientId ? clientById.get(v.clientId) : null;
    for (const date of dates) {
      visitRows.push({
        id: \`remote_\${d.id}_\${date}\`,
        client_id: v.clientId ?? "",
        name: client?.name ?? "",
        phone: client?.phone ?? "",
        vehicle_plate: v.plate ?? "",
        vehicle_model: v.model ?? "",
        location: v.location ?? client?.location ?? "",
        issue: "",
        visit_date: date,
        created_at: v.firstVisit ? \`\${v.firstVisit}T00:00:00.000Z\` : new Date().toISOString(),
        synced: true,
      });
    }
  });

  const CHUNK = 400;
  let nc = 0, nv = 0;
  for (let i = 0; i < clientRows.length; i += CHUNK) nc += await upsertRemoteClients(clientRows.slice(i, i + CHUNK));
  for (let i = 0; i < visitRows.length; i += CHUNK) nv += await upsertRemoteVisits(visitRows.slice(i, i + CHUNK));

  return { clients: nc, visits: nv };
}`],
]);

// ---------- src/App.tsx ----------
patch("src/App.tsx", [
  ["widen the ./sync import",
`import { flushSyncQueue } from "./sync";`,
`import { flushSyncQueue, pullFromRemote } from "./sync";`],
  ["add updating state",
`  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Visit | null>(null);`,
`  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Visit | null>(null);
  const [updating, setUpdating] = useState(false);`],
  ["add the Update button next to Export Monthly",
`        >Export Monthly</button>
        {online !== null && (`,
`        >Export Monthly</button>
        <button
          className="input-field"
          style={{ marginLeft: 8, cursor: "pointer" }}
          disabled={updating}
          onClick={async () => {
            setUpdating(true);
            try {
              const { clients, visits } = await pullFromRemote();
              await refresh();
              alert(\`Updated: \${clients} clients, \${visits} visits merged from the database.\`);
            } catch (err) {
              alert("Update failed: " + (err instanceof Error ? err.message : String(err)));
              logCrash("update", err instanceof Error ? err.message : String(err));
            } finally {
              setUpdating(false);
            }
          }}
        >{updating ? "Updating..." : "Update"}</button>
        {online !== null && (`],
]);

console.log("\\nAll patches applied.");
