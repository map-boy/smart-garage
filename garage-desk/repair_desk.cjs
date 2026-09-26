const fs = require("fs");
const path = require("path");

const eolOf = t => (t.includes("\r\n") ? "\r\n" : "\n");
const toEol = (s, eol) => s.replace(/\r?\n/g, eol);

function applyEdits(file, text, edits) {
  const eol = eolOf(text);
  for (const [label, oldStr, newStr] of edits) {
    const o = toEol(oldStr, eol);
    const n = toEol(newStr, eol);
    const count = text.split(o).length - 1;
    if (count !== 1) throw new Error(file + ': anchor "' + label + '" matched ' + count + " times (need 1) - aborting, nothing written");
    text = text.replace(o, () => n);
  }
  return text;
}

const results = {}; // file -> new text (only files that need writing)

// ---------- 1. main.rs: move the two fns above fn main, restore invoke_handler ----------
{
  const f = "src-tauri/src/main.rs";
  const text = fs.readFileSync(f, "utf8");
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);

  const iBad = lines.findIndex(l => l.includes("tauri::#[tauri::command]"));
  if (iBad < 0) {
    console.log("main.rs: broken line not found - assuming already repaired, skipping");
  } else {
    const mains = lines.map((l, i) => (l.startsWith("fn main()") ? i : -1)).filter(i => i >= 0);
    if (mains.length !== 1) throw new Error("main.rs: expected exactly one 'fn main()', found " + mains.length);
    const iMain = mains[0];
    const iPh = lines.findIndex(l => l.includes("fn main_placeholder_anchor_unused"));
    const iGen = lines.findIndex((l, i) => i > iPh && l.trim() === "generate_handler![");
    if (!(iMain >= 0 && iMain < iBad && iBad < iPh && iPh > 0 && iPh < iGen))
      throw new Error("main.rs: unexpected layout (main=" + iMain + " bad=" + iBad + " placeholder=" + iPh + " gen=" + iGen + ") - aborting");

    const body = lines.slice(iBad + 1, iPh);
    while (body.length && body[body.length - 1].trim() === "") body.pop();

    const newLines = [
      ...lines.slice(0, iMain),
      "",
      "#[tauri::command]",
      ...body,
      "",
      ...lines.slice(iMain, iBad),
      "        .invoke_handler(tauri::generate_handler![",
      ...lines.slice(iGen + 1),
    ];
    const out = newLines.join(eol);

    const cnt = (s, sub) => s.split(sub).length - 1;
    if (cnt(out, "generate_handler![") !== 1) throw new Error("main.rs: sanity check failed (generate_handler count)");
    if (out.includes("tauri::#[")) throw new Error("main.rs: sanity check failed (bad line still present)");
    if (cnt(out, "fn upsert_remote_clients") !== 1 || cnt(out, "fn upsert_remote_visits") !== 1)
      throw new Error("main.rs: sanity check failed (upsert fn count)");
    if (out.includes("main_placeholder_anchor_unused")) throw new Error("main.rs: placeholder still present");
    results[f] = out;
  }
}

// ---------- 2. db.ts: verify only ----------
{
  const t = fs.readFileSync("src/db.ts", "utf8");
  if (!t.includes("upsertRemoteClients") || !t.includes("upsertRemoteVisits"))
    throw new Error("db.ts: upsertRemote exports missing - tell me, don't continue");
  console.log("db.ts: pull exports present (no change)");
}

// ---------- 3. sync.ts (CRLF-aware) ----------
{
  const f = "src/sync.ts";
  const text = fs.readFileSync(f, "utf8");
  if (text.includes("pullFromRemote")) {
    console.log("sync.ts: pullFromRemote already present, skipping");
  } else {
    results[f] = applyEdits(f, text, [
      ["widen the ./db import",
`  logCrash,
  type QueueRow,
  type SyncTable,
} from "./db";`,
`  logCrash,
  upsertRemoteClients,
  upsertRemoteVisits,
  type QueueRow,
  type SyncTable,
  type Client,
  type Visit,
} from "./db";`],
      ["append pullFromRemote after startSyncLoop",
`  }, intervalMs);
  return () => clearInterval(id);
}`,
`  }, intervalMs);
  return () => clearInterval(id);
}

/** Firestore may hold ISO strings, "YYYY-MM-DD" strings or Timestamps; Rust wants a plain string. */
function toIsoString(v: unknown): string {
  if (typeof v === "string" && v) return v.length === 10 ? v + "T00:00:00.000Z" : v;
  if (v && typeof (v as { toDate?: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

/**
 * Pulls clients and vehicle visit history from Firestore and merges them into
 * the local SQLite db. Rows go straight into clients/visits (synced = 1)
 * without touching sync_queue, so nothing is pushed back and there is no
 * push/pull loop. Visit ids are deterministic (remote_<vehicleDocId>_<date>),
 * so running it again updates the same rows instead of duplicating them.
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
      created_at: toIsoString(c.createdAt),
      synced: true,
    });
  });

  const vehicleSnap = await getDocs(collection(db, "garages", GARAGE_ID, "vehicles"));
  const visitRows: Visit[] = [];
  vehicleSnap.forEach((d) => {
    const v = d.data();
    const dates: string[] = Array.isArray(v.visitDates)
      ? v.visitDates.map((x: unknown) => (typeof x === "string" ? x : toIsoString(x).slice(0, 10)))
      : [];
    if (!dates.length) return;
    const client = v.clientId ? clientById.get(v.clientId) : null;
    for (const date of dates) {
      visitRows.push({
        id: "remote_" + d.id + "_" + date,
        client_id: v.clientId ?? "",
        name: client?.name ?? "",
        phone: client?.phone ?? "",
        vehicle_plate: v.plate ?? "",
        vehicle_model: v.model ?? "",
        location: v.location ?? client?.location ?? "",
        issue: "",
        visit_date: date,
        created_at: v.firstVisit ? toIsoString(v.firstVisit) : new Date().toISOString(),
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
  }
}

// ---------- 4. App.tsx ----------
{
  const f = "src/App.tsx";
  const text = fs.readFileSync(f, "utf8");
  if (text.includes("pullFromRemote")) {
    console.log("App.tsx: pullFromRemote already present, skipping");
  } else {
    results[f] = applyEdits(f, text, [
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
              alert("Updated: " + clients + " clients, " + visits + " visits merged from the database.");
            } catch (err) {
              alert("Update failed: " + (err instanceof Error ? err.message : String(err)));
            } finally {
              setUpdating(false);
            }
          }}
        >{updating ? "Updating..." : "Update"}</button>
        {online !== null && (`],
    ]);
  }
}

// ---------- write phase (only reached if every step above passed) ----------
fs.mkdirSync(".patch-backup", { recursive: true });
for (const [f, out] of Object.entries(results)) {
  fs.copyFileSync(f, path.join(".patch-backup", f.replace(/[\\/]/g, "__")));
  fs.writeFileSync(f, out, "utf8");
  console.log("wrote " + f);
}

// ---------- verification printout ----------
console.log("\n=== verify main.rs ===");
{
  const lines = fs.readFileSync("src-tauri/src/main.rs", "utf8").split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/^fn main\(|#\[tauri::command\]|invoke_handler|generate_handler|fn upsert_remote_|upsert_remote_(clients|visits),/.test(l))
      console.log(String(i + 1).padStart(4), l);
  });
}
console.log("\nDone.");
