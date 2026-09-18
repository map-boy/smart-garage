#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};
use uuid::Uuid;
use chrono::Utc;

struct Db(Mutex<Connection>);

const DEFAULT_GROUP: &str = "General";

#[derive(Serialize, Deserialize, Clone)]
struct Client {
    id: String,
    name: String,
    phone: String,
    vehicle_plate: String,
    vehicle_model: String,
    location: String,
    issue: String,
    created_at: String,
    synced: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct Visit {
    id: String,
    client_id: String,
    name: String,
    phone: String,
    vehicle_plate: String,
    vehicle_model: String,
    location: String,
    issue: String,
    visit_date: String,
    created_at: String,
    synced: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct StockGroup {
    id: String,
    name: String,
    created_at: String,
    synced: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct StockItem {
    id: String,
    name: String,
    qty: f64,
    unit_price: f64,
    group_id: Option<String>,
    group_name: String,
    updated_at: String,
    entered_at: String,
    left_at: Option<String>,
    synced: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct StockMovement {
    id: String,
    part_id: String,
    part_name: String,
    delta: f64,
    qty_after: f64,
    reason: String,
    created_at: String,
    synced: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct QueueRow {
    id: String,
    table_name: String,
    row_id: String,
    op: String,
    payload: String,
    created_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct CrashLog {
    id: String,
    source: String,
    message: String,
    created_at: String,
}

fn init_db(conn: &Connection) {
    conn.execute("DROP TABLE IF EXISTS device_session", []).ok();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY, name TEXT, phone TEXT, vehicle_plate TEXT,
            issue TEXT, created_at TEXT, synced INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS visits (
            id TEXT PRIMARY KEY, client_id TEXT, name TEXT, phone TEXT,
            vehicle_plate TEXT, vehicle_model TEXT, location TEXT, issue TEXT,
            visit_date TEXT, created_at TEXT, synced INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS stock_groups (
            id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
            created_at TEXT, synced INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS stock_items (
            id TEXT PRIMARY KEY, name TEXT, qty INTEGER, unit_price REAL,
            category TEXT DEFAULT 'General', updated_at TEXT, synced INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS stock_movements (
            id TEXT PRIMARY KEY, part_id TEXT, part_name TEXT, delta INTEGER,
            qty_after INTEGER, reason TEXT, created_at TEXT, synced INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sync_queue (
            id TEXT PRIMARY KEY, table_name TEXT, row_id TEXT, op TEXT,
            payload TEXT, created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS crash_log (
            id TEXT PRIMARY KEY, source TEXT, message TEXT, created_at TEXT
        );",
    ).expect("failed to init db schema");

    // Idempotent column adds. These fail harmlessly on a database that already
    // has them, which is how this project has always done migrations.
    conn.execute("ALTER TABLE stock_items ADD COLUMN category TEXT DEFAULT 'General'", []).ok();
    conn.execute("ALTER TABLE stock_items ADD COLUMN group_id TEXT REFERENCES stock_groups(id)", []).ok();
    conn.execute("ALTER TABLE stock_items ADD COLUMN entered_at TEXT", []).ok();
    conn.execute("ALTER TABLE stock_items ADD COLUMN left_at TEXT", []).ok();
    conn.execute("UPDATE stock_items SET entered_at = COALESCE(entered_at, updated_at) WHERE entered_at IS NULL", []).ok();
    conn.execute("ALTER TABLE clients ADD COLUMN vehicle_model TEXT DEFAULT ''", []).ok();
    conn.execute("ALTER TABLE clients ADD COLUMN location TEXT DEFAULT ''", []).ok();

    ensure_group(conn, DEFAULT_GROUP);
    backfill_groups(conn);
}

/// Returns the id of the named group, creating it if it does not exist.
fn ensure_group(conn: &Connection, name: &str) -> String {
    if let Ok(id) = conn.query_row(
        "SELECT id FROM stock_groups WHERE name = ?1",
        params![name],
        |r| r.get::<_, String>(0),
    ) {
        return id;
    }
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO stock_groups (id, name, created_at, synced) VALUES (?1, ?2, ?3, 0)",
        params![id, name, Utc::now().to_rfc3339()],
    ).ok();
    id
}

/// Turns the old free-text `category` on each item into a real group row.
/// Runs once per item - anything already carrying a group_id is left alone.
fn backfill_groups(conn: &Connection) {
    let mut names: Vec<String> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT DISTINCT COALESCE(NULLIF(TRIM(category), ''), 'General')
         FROM stock_items WHERE group_id IS NULL",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
            for n in rows.flatten() { names.push(n); }
        }
    }
    for name in names {
        let gid = ensure_group(conn, &name);
        conn.execute(
            "UPDATE stock_items SET group_id = ?1
             WHERE group_id IS NULL
               AND COALESCE(NULLIF(TRIM(category), ''), 'General') = ?2",
            params![gid, name],
        ).ok();
    }
}

fn enqueue(conn: &Connection, table_name: &str, row_id: &str, op: &str, payload: &str) {
    conn.execute(
        "INSERT INTO sync_queue (id, table_name, row_id, op, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![Uuid::new_v4().to_string(), table_name, row_id, op, payload, Utc::now().to_rfc3339()],
    ).ok();
}

/// Every quantity change leaves a row here. This is what the boss dashboard
/// reads from garages/{garageId}/stockMovements - append-only by rule, so a
/// mistake is corrected with another movement, never by editing this one.
fn record_movement(conn: &Connection, item: &StockItem, delta: f64, reason: &str) {
    let id = Uuid::new_v4().to_string();
    let created = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO stock_movements (id, part_id, part_name, delta, qty_after, reason, created_at, synced)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)",
        params![id, item.id, item.name, delta, item.qty, reason, created],
    ).ok();
    let payload = serde_json::json!({
        "id": id,
        "part_id": item.id,
        "part_name": item.name,
        "delta": delta,
        "qty_after": item.qty,
        "reason": reason,
        "created_at": created
    }).to_string();
    enqueue(conn, "stock_movements", &id, "create", &payload);
}

fn read_item(conn: &Connection, id: &str) -> Result<StockItem, String> {
    conn.query_row(
        "SELECT i.id, i.name, i.qty, i.unit_price, i.group_id,
                COALESCE(g.name, 'General'), i.updated_at, i.entered_at, i.left_at, i.synced
         FROM stock_items i LEFT JOIN stock_groups g ON g.id = i.group_id
         WHERE i.id = ?1",
        params![id],
        |r| Ok(StockItem {
            id: r.get(0)?, name: r.get(1)?, qty: r.get(2)?, unit_price: r.get(3)?,
            group_id: r.get(4)?, group_name: r.get(5)?, updated_at: r.get(6)?,
            entered_at: r.get(7)?, left_at: r.get(8)?,
            synced: r.get::<_, i64>(9)? != 0,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
fn verify_login(password: String) -> Result<bool, String> {
    Ok(password == "smartgarage")
}

#[tauri::command]
fn add_client(db: State<Db>, name: String, phone: String, vehicle_plate: String, vehicle_model: String, location: String, issue: String) -> Result<Client, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let client = Client {
        id: Uuid::new_v4().to_string(),
        name, phone, vehicle_plate, vehicle_model, location, issue,
        created_at: Utc::now().to_rfc3339(),
        synced: false,
    };
    conn.execute(
        "INSERT INTO clients (id, name, phone, vehicle_plate, vehicle_model, location, issue, created_at, synced) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)",
        params![client.id, client.name, client.phone, client.vehicle_plate, client.vehicle_model, client.location, client.issue, client.created_at],
    ).map_err(|e| e.to_string())?;
    let payload = serde_json::to_string(&client).map_err(|e| e.to_string())?;
    enqueue(&conn, "clients", &client.id, "create", &payload);
    Ok(client)
}

#[tauri::command]
fn list_clients(db: State<Db>) -> Result<Vec<Client>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, phone, vehicle_plate, vehicle_model, location, issue, created_at, synced FROM clients ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok(Client {
            id: r.get(0)?, name: r.get(1)?, phone: r.get(2)?, vehicle_plate: r.get(3)?,
            vehicle_model: r.get(4)?, location: r.get(5)?,
            issue: r.get(6)?, created_at: r.get(7)?, synced: r.get::<_, i64>(8)? != 0,
        })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_client(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM clients WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    enqueue(&conn, "clients", &id, "delete", "{}");
    Ok(())
}

#[tauri::command]
fn add_visit(
    db: State<Db>,
    client_id: Option<String>,
    name: String,
    phone: String,
    vehicle_plate: String,
    vehicle_model: String,
    location: String,
    issue: String,
    visit_date: Option<String>,
) -> Result<Visit, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let cid = match client_id.filter(|c| !c.trim().is_empty()) {
        Some(c) => c,
        None => {
            let id = Uuid::new_v4().to_string();
            let created = Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO clients (id, name, phone, vehicle_plate, vehicle_model, location, issue, created_at, synced) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)",
                params![id, name, phone, vehicle_plate, vehicle_model, location, issue, created],
            ).map_err(|e| e.to_string())?;
            let payload = serde_json::json!({
                "id": id, "name": name, "phone": phone, "vehicle_plate": vehicle_plate,
                "vehicle_model": vehicle_model, "location": location, "issue": issue,
                "created_at": created, "synced": false
            }).to_string();
            enqueue(&conn, "clients", &id, "create", &payload);
            id
        }
    };

    let visit = Visit {
        id: Uuid::new_v4().to_string(),
        client_id: cid,
        name, phone, vehicle_plate, vehicle_model, location, issue,
        visit_date: visit_date
            .filter(|d| !d.trim().is_empty())
            .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string()),
        created_at: Utc::now().to_rfc3339(),
        synced: false,
    };
    conn.execute(
        "INSERT INTO visits (id, client_id, name, phone, vehicle_plate, vehicle_model, location, issue, visit_date, created_at, synced)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0)",
        params![visit.id, visit.client_id, visit.name, visit.phone, visit.vehicle_plate, visit.vehicle_model, visit.location, visit.issue, visit.visit_date, visit.created_at],
    ).map_err(|e| e.to_string())?;
    let payload = serde_json::to_string(&visit).map_err(|e| e.to_string())?;
    enqueue(&conn, "visits", &visit.id, "create", &payload);
    Ok(visit)
}

#[tauri::command]
fn update_visit(
    db: State<Db>,
    id: String,
    name: String,
    phone: String,
    vehicle_plate: String,
    vehicle_model: String,
    location: String,
    visit_date: String,
) -> Result<Visit, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE visits SET name = ?1, phone = ?2, vehicle_plate = ?3, vehicle_model = ?4, location = ?5, visit_date = ?6, synced = 0 WHERE id = ?7",
        params![name, phone, vehicle_plate, vehicle_model, location, visit_date, id],
    ).map_err(|e| e.to_string())?;
    let visit = conn.query_row(
        "SELECT id, client_id, name, phone, vehicle_plate, vehicle_model, location, issue, visit_date, created_at, synced FROM visits WHERE id = ?1",
        params![id],
        |r| Ok(Visit {
            id: r.get(0)?, client_id: r.get(1)?, name: r.get(2)?, phone: r.get(3)?,
            vehicle_plate: r.get(4)?, vehicle_model: r.get(5)?, location: r.get(6)?,
            issue: r.get(7)?, visit_date: r.get(8)?, created_at: r.get(9)?,
            synced: r.get::<_, i64>(10)? != 0,
        }),
    ).map_err(|e| e.to_string())?;
    let payload = serde_json::to_string(&visit).map_err(|e| e.to_string())?;
    enqueue(&conn, "visits", &visit.id, "update", &payload);
    Ok(visit)
}

#[tauri::command]
fn list_visits(db: State<Db>) -> Result<Vec<Visit>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, client_id, name, phone, vehicle_plate, vehicle_model, location, issue, visit_date, created_at, synced
         FROM visits ORDER BY visit_date DESC, created_at DESC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok(Visit {
            id: r.get(0)?, client_id: r.get(1)?, name: r.get(2)?, phone: r.get(3)?,
            vehicle_plate: r.get(4)?, vehicle_model: r.get(5)?, location: r.get(6)?,
            issue: r.get(7)?, visit_date: r.get(8)?, created_at: r.get(9)?,
            synced: r.get::<_, i64>(10)? != 0,
        })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_visit(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM visits WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    enqueue(&conn, "visits", &id, "delete", "{}");
    Ok(())
}

// ---- stock groups -------------------------------------------------------

#[tauri::command]
fn list_stock_groups(db: State<Db>) -> Result<Vec<StockGroup>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, created_at, synced FROM stock_groups
         ORDER BY (name = 'General') DESC, name ASC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok(StockGroup {
            id: r.get(0)?, name: r.get(1)?, created_at: r.get(2)?,
            synced: r.get::<_, i64>(3)? != 0,
        })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn add_stock_group(db: State<Db>, name: String) -> Result<StockGroup, String> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() { return Err("Group name cannot be empty".into()); }
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    if let Ok(existing) = conn.query_row(
        "SELECT id, name, created_at, synced FROM stock_groups WHERE name = ?1 COLLATE NOCASE",
        params![trimmed],
        |r| Ok(StockGroup { id: r.get(0)?, name: r.get(1)?, created_at: r.get(2)?, synced: r.get::<_, i64>(3)? != 0 }),
    ) {
        return Ok(existing);
    }

    let group = StockGroup {
        id: Uuid::new_v4().to_string(),
        name: trimmed,
        created_at: Utc::now().to_rfc3339(),
        synced: false,
    };
    conn.execute(
        "INSERT INTO stock_groups (id, name, created_at, synced) VALUES (?1, ?2, ?3, 0)",
        params![group.id, group.name, group.created_at],
    ).map_err(|e| e.to_string())?;
    let payload = serde_json::to_string(&group).map_err(|e| e.to_string())?;
    enqueue(&conn, "stock_groups", &group.id, "create", &payload);
    Ok(group)
}

#[tauri::command]
fn rename_stock_group(db: State<Db>, id: String, name: String) -> Result<StockGroup, String> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() { return Err("Group name cannot be empty".into()); }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE stock_groups SET name = ?1, synced = 0 WHERE id = ?2",
        params![trimmed, id],
    ).map_err(|e| e.to_string())?;
    let group = conn.query_row(
        "SELECT id, name, created_at, synced FROM stock_groups WHERE id = ?1",
        params![id],
        |r| Ok(StockGroup { id: r.get(0)?, name: r.get(1)?, created_at: r.get(2)?, synced: r.get::<_, i64>(3)? != 0 }),
    ).map_err(|e| e.to_string())?;
    let payload = serde_json::to_string(&group).map_err(|e| e.to_string())?;
    enqueue(&conn, "stock_groups", &group.id, "update", &payload);

    // The group name travels with each item, so the items need repushing too.
    let mut stmt = conn.prepare("SELECT id FROM stock_items WHERE group_id = ?1").map_err(|e| e.to_string())?;
    let ids: Vec<String> = stmt.query_map(params![id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?.flatten().collect();
    drop(stmt);
    for item_id in ids {
        if let Ok(item) = read_item(&conn, &item_id) {
            let p = serde_json::to_string(&item).unwrap_or_default();
            enqueue(&conn, "stock_items", &item.id, "update", &p);
        }
    }
    Ok(group)
}

#[tauri::command]
fn delete_stock_group(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let name: String = conn.query_row(
        "SELECT name FROM stock_groups WHERE id = ?1", params![id], |r| r.get(0),
    ).map_err(|e| e.to_string())?;
    if name == DEFAULT_GROUP {
        return Err("The General group cannot be removed".into());
    }

    let fallback = ensure_group(&conn, DEFAULT_GROUP);
    let mut stmt = conn.prepare("SELECT id FROM stock_items WHERE group_id = ?1").map_err(|e| e.to_string())?;
    let ids: Vec<String> = stmt.query_map(params![id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?.flatten().collect();
    drop(stmt);

    conn.execute(
        "UPDATE stock_items SET group_id = ?1, updated_at = ?2, synced = 0 WHERE group_id = ?3",
        params![fallback, Utc::now().to_rfc3339(), id],
    ).map_err(|e| e.to_string())?;

    for item_id in ids {
        if let Ok(item) = read_item(&conn, &item_id) {
            let p = serde_json::to_string(&item).unwrap_or_default();
            enqueue(&conn, "stock_items", &item.id, "update", &p);
        }
    }

    conn.execute("DELETE FROM stock_groups WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    enqueue(&conn, "stock_groups", &id, "delete", "{}");
    Ok(())
}

// ---- stock items --------------------------------------------------------

#[tauri::command]
fn add_stock_item(db: State<Db>, name: String, qty: f64, unit_price: f64, group_id: Option<String>, entered_at: Option<String>) -> Result<StockItem, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let gid = match group_id.filter(|g| !g.trim().is_empty()) {
        Some(g) => g,
        None => ensure_group(&conn, DEFAULT_GROUP),
    };
    let group_name: String = conn.query_row(
        "SELECT name FROM stock_groups WHERE id = ?1", params![gid], |r| r.get(0),
    ).unwrap_or_else(|_| DEFAULT_GROUP.to_string());

    let now = Utc::now().to_rfc3339();
    let entered = entered_at.filter(|d| !d.trim().is_empty()).unwrap_or_else(|| now.clone());
    let item = StockItem {
        id: Uuid::new_v4().to_string(),
        name, qty, unit_price,
        group_id: Some(gid.clone()),
        group_name: group_name.clone(),
        updated_at: now.clone(),
        entered_at: entered,
        left_at: None,
        synced: false,
    };
    conn.execute(
        "INSERT INTO stock_items (id, name, qty, unit_price, category, group_id, updated_at, entered_at, synced)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)",
        params![item.id, item.name, item.qty, item.unit_price, group_name, gid, item.updated_at, item.entered_at],
    ).map_err(|e| e.to_string())?;
    let payload = serde_json::to_string(&item).map_err(|e| e.to_string())?;
    enqueue(&conn, "stock_items", &item.id, "create", &payload);
    if item.qty != 0.0 {
        record_movement(&conn, &item, item.qty, "opening balance");
    }
    Ok(item)
}

#[tauri::command]
fn update_stock_qty(db: State<Db>, id: String, delta: f64) -> Result<StockItem, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE stock_items SET qty = qty + ?1, updated_at = ?2, synced = 0 WHERE id = ?3",
        params![delta, now, id],
    ).map_err(|e| e.to_string())?;

    let peek = read_item(&conn, &id)?;
    if peek.qty <= 0.0 && peek.left_at.is_none() {
        conn.execute("UPDATE stock_items SET left_at = ?1 WHERE id = ?2", params![now, id]).ok();
    }
    if peek.qty > 0.0 && peek.left_at.is_some() {
        conn.execute("UPDATE stock_items SET left_at = NULL, entered_at = ?1 WHERE id = ?2", params![now, id]).ok();
    }

    let item = read_item(&conn, &id)?;
    if item.qty < 0.0 {
        log_crash_internal(&conn, "stock", &format!("Negative stock for item {}", item.id));
    }
    let payload = serde_json::to_string(&item).map_err(|e| e.to_string())?;
    enqueue(&conn, "stock_items", &item.id, "update", &payload);
    record_movement(&conn, &item, delta, if delta >= 0.0 { "added" } else { "taken out" });
    Ok(item)
}

#[tauri::command]
fn update_stock_item(
    db: State<Db>,
    id: String,
    name: String,
    qty: f64,
    unit_price: f64,
    group_id: Option<String>,
    entered_at: String,
    left_at: Option<String>,
) -> Result<StockItem, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let old = read_item(&conn, &id)?;
    let gid = match group_id.filter(|g| !g.trim().is_empty()) {
        Some(g) => g,
        None => old.group_id.clone().unwrap_or_else(|| ensure_group(&conn, DEFAULT_GROUP)),
    };
    let group_name: String = conn.query_row(
        "SELECT name FROM stock_groups WHERE id = ?1", params![gid], |r| r.get(0),
    ).unwrap_or_else(|_| DEFAULT_GROUP.to_string());
    let now = Utc::now().to_rfc3339();
    let left = left_at.filter(|d| !d.trim().is_empty());

    conn.execute(
        "UPDATE stock_items SET name = ?1, qty = ?2, unit_price = ?3, group_id = ?4, category = ?5, entered_at = ?6, left_at = ?7, updated_at = ?8, synced = 0 WHERE id = ?9",
        params![name, qty, unit_price, gid, group_name, entered_at, left, now, id],
    ).map_err(|e| e.to_string())?;

    let item = read_item(&conn, &id)?;
    let payload = serde_json::to_string(&item).map_err(|e| e.to_string())?;
    enqueue(&conn, "stock_items", &item.id, "update", &payload);

    let delta = qty - old.qty;
    if delta != 0.0 {
        record_movement(&conn, &item, delta, "edited");
    }
    Ok(item)
}

#[tauri::command]
fn update_stock_dates(db: State<Db>, id: String, entered_at: String, left_at: Option<String>) -> Result<StockItem, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let left = left_at.filter(|d| !d.trim().is_empty());
    conn.execute(
        "UPDATE stock_items SET entered_at = ?1, left_at = ?2, synced = 0 WHERE id = ?3",
        params![entered_at, left, id],
    ).map_err(|e| e.to_string())?;
    let item = read_item(&conn, &id)?;
    let payload = serde_json::to_string(&item).map_err(|e| e.to_string())?;
    enqueue(&conn, "stock_items", &item.id, "update", &payload);
    Ok(item)
}

#[tauri::command]
fn set_stock_item_group(db: State<Db>, id: String, group_id: String) -> Result<StockItem, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let group_name: String = conn.query_row(
        "SELECT name FROM stock_groups WHERE id = ?1", params![group_id], |r| r.get(0),
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE stock_items SET group_id = ?1, category = ?2, updated_at = ?3, synced = 0 WHERE id = ?4",
        params![group_id, group_name, Utc::now().to_rfc3339(), id],
    ).map_err(|e| e.to_string())?;
    let item = read_item(&conn, &id)?;
    let payload = serde_json::to_string(&item).map_err(|e| e.to_string())?;
    enqueue(&conn, "stock_items", &item.id, "update", &payload);
    Ok(item)
}

#[tauri::command]
fn list_stock(db: State<Db>) -> Result<Vec<StockItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT i.id, i.name, i.qty, i.unit_price, i.group_id,
                COALESCE(g.name, 'General') AS gname, i.updated_at, i.entered_at, i.left_at, i.synced
         FROM stock_items i LEFT JOIN stock_groups g ON g.id = i.group_id
         ORDER BY gname ASC, i.name ASC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok(StockItem {
            id: r.get(0)?, name: r.get(1)?, qty: r.get(2)?, unit_price: r.get(3)?,
            group_id: r.get(4)?, group_name: r.get(5)?, updated_at: r.get(6)?,
            entered_at: r.get(7)?, left_at: r.get(8)?,
            synced: r.get::<_, i64>(9)? != 0,
        })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_stock_item(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    if let Ok(item) = read_item(&conn, &id) {
        if item.qty != 0.0 {
            let zeroed = StockItem { qty: 0.0, ..item.clone() };
            record_movement(&conn, &zeroed, -item.qty, "item removed");
        }
    }
    conn.execute("DELETE FROM stock_items WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    enqueue(&conn, "stock_items", &id, "delete", "{}");
    Ok(())
}

#[tauri::command]
fn list_stock_movements(db: State<Db>) -> Result<Vec<StockMovement>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, part_id, part_name, delta, qty_after, reason, created_at, synced
         FROM stock_movements ORDER BY created_at DESC LIMIT 200"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok(StockMovement {
            id: r.get(0)?, part_id: r.get(1)?, part_name: r.get(2)?, delta: r.get(3)?,
            qty_after: r.get(4)?, reason: r.get(5)?, created_at: r.get(6)?,
            synced: r.get::<_, i64>(7)? != 0,
        })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ---- sync queue ---------------------------------------------------------

#[tauri::command]
fn queue_pending(db: State<Db>) -> Result<Vec<QueueRow>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, table_name, row_id, op, payload, created_at FROM sync_queue ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok(QueueRow {
            id: r.get(0)?, table_name: r.get(1)?, row_id: r.get(2)?,
            op: r.get(3)?, payload: r.get(4)?, created_at: r.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn queue_mark_synced(db: State<Db>, queue_id: String, table_name: String, row_id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sync_queue WHERE id = ?1", params![queue_id]).map_err(|e| e.to_string())?;
    // The table name is interpolated into SQL, so it is checked against a fixed
    // list rather than trusted from the caller.
    const ALLOWED: [&str; 5] = ["clients", "stock_items", "stock_groups", "stock_movements", "visits"];
    if ALLOWED.contains(&table_name.as_str()) {
        conn.execute(
            &format!("UPDATE {} SET synced = 1 WHERE id = ?1", table_name),
            params![row_id],
        ).ok();
    }
    Ok(())
}

fn log_crash_internal(conn: &Connection, source: &str, message: &str) {
    conn.execute(
        "INSERT INTO crash_log (id, source, message, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![Uuid::new_v4().to_string(), source, message, Utc::now().to_rfc3339()],
    ).ok();
}

#[tauri::command]
fn log_crash(db: State<Db>, source: String, message: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    log_crash_internal(&conn, &source, &message);
    Ok(())
}

#[tauri::command]
fn list_crash_logs(db: State<Db>) -> Result<Vec<CrashLog>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, source, message, created_at FROM crash_log ORDER BY created_at DESC LIMIT 200").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok(CrashLog { id: r.get(0)?, source: r.get(1)?, message: r.get(2)?, created_at: r.get(3)? })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_internet() -> bool {
    match reqwest::Client::new()
        .get("https://firestore.googleapis.com")
        .timeout(std::time::Duration::from_millis(1500))
        .send()
        .await
    {
        Ok(_) => true,
        Err(_) => false,
    }
}

#[tauri::command]
fn export_report(kind: String, date: String, db: State<Db>) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let like_len: i64 = if kind == "monthly" { 7 } else { 10 };
    let mut vstmt = conn.prepare("SELECT name, phone, vehicle_plate, vehicle_model, location, issue, visit_date FROM visits WHERE substr(visit_date,1,?1)=?2 ORDER BY visit_date").map_err(|e| e.to_string())?;
    let visits: Vec<(String,String,String,String,String,String,String)> = vstmt.query_map(rusqlite::params![like_len, date], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?))).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    let mut mstmt = conn.prepare("SELECT part_name, delta, qty_after, reason, created_at FROM stock_movements WHERE substr(created_at,1,?1)=?2 ORDER BY created_at").map_err(|e| e.to_string())?;
    let moves: Vec<(String,i64,i64,String,String)> = mstmt.query_map(rusqlite::params![like_len, date], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
    let mut csv = String::from("RECEPTION VISITS\nName,Phone,Plate,Model,Location,Issue,Visit Date\n");
    for v in &visits { csv.push_str(&format!("{},{},{},{},{},{},{}\n", v.0,v.1,v.2,v.3,v.4,v.5,v.6)); }
    csv.push_str("\nSTOCK MOVEMENTS\nPart,Delta,Qty After,Reason,Date\n");
    for m in &moves { csv.push_str(&format!("{},{},{},{},{}\n", m.0,m.1,m.2,m.3,m.4)); }
    let desktop = match std::env::var("USERPROFILE") { Ok(up) => std::path::PathBuf::from(up).join("Desktop"), Err(_) => std::path::PathBuf::from(".") };
    let fname = format!("{}_report_{}.csv", kind, date.replace("-", ""));
    let out_path = desktop.join(fname);
    std::fs::write(&out_path, csv).map_err(|e| e.to_string())?;
    Ok(out_path.to_string_lossy().to_string())
}
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("garage-local.db");
            let conn = Connection::open(db_path).expect("failed to open sqlite db");
            init_db(&conn);
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            verify_login,
            add_client,
            list_clients,
            delete_client,
            add_visit,
            update_visit,
            list_visits,
            delete_visit,
            list_stock_groups,
            add_stock_group,
            rename_stock_group,
            delete_stock_group,
            add_stock_item,
            update_stock_qty,
            set_stock_item_group,
            update_stock_dates,
            update_stock_item,
            list_stock,
            delete_stock_item,
            list_stock_movements,
            queue_pending,
            queue_mark_synced,
            log_crash,
            list_crash_logs,
            check_internet,
            export_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}