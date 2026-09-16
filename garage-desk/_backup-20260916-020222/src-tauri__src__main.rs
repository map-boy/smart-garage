#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};
use uuid::Uuid;
use chrono::Utc;

struct Db(Mutex<Connection>);

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
struct StockItem {
    id: String,
    name: String,
    qty: i64,
    unit_price: f64,
    category: String,
    updated_at: String,
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
        CREATE TABLE IF NOT EXISTS stock_items (
            id TEXT PRIMARY KEY, name TEXT, qty INTEGER, unit_price REAL,
            category TEXT DEFAULT 'General', updated_at TEXT, synced INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sync_queue (
            id TEXT PRIMARY KEY, table_name TEXT, row_id TEXT, op TEXT,
            payload TEXT, created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS crash_log (
            id TEXT PRIMARY KEY, source TEXT, message TEXT, created_at TEXT
        );",
    ).expect("failed to init db schema");
    conn.execute("ALTER TABLE stock_items ADD COLUMN category TEXT DEFAULT 'General'", []).ok();
    conn.execute("ALTER TABLE clients ADD COLUMN vehicle_model TEXT DEFAULT ''", []).ok();
    conn.execute("ALTER TABLE clients ADD COLUMN location TEXT DEFAULT ''", []).ok();
}

fn enqueue(conn: &Connection, table_name: &str, row_id: &str, op: &str, payload: &str) {
    conn.execute(
        "INSERT INTO sync_queue (id, table_name, row_id, op, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![Uuid::new_v4().to_string(), table_name, row_id, op, payload, Utc::now().to_rfc3339()],
    ).ok();
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
fn add_stock_item(db: State<Db>, name: String, qty: i64, unit_price: f64, category: String) -> Result<StockItem, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let item = StockItem {
        id: Uuid::new_v4().to_string(), name, qty, unit_price, category,
        updated_at: Utc::now().to_rfc3339(), synced: false,
    };
    conn.execute(
        "INSERT INTO stock_items (id, name, qty, unit_price, category, updated_at, synced) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)",
        params![item.id, item.name, item.qty, item.unit_price, item.category, item.updated_at],
    ).map_err(|e| e.to_string())?;
    let payload = serde_json::to_string(&item).map_err(|e| e.to_string())?;
    enqueue(&conn, "stock_items", &item.id, "create", &payload);
    Ok(item)
}

#[tauri::command]
fn update_stock_qty(db: State<Db>, id: String, delta: i64) -> Result<StockItem, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE stock_items SET qty = qty + ?1, updated_at = ?2, synced = 0 WHERE id = ?3",
        params![delta, Utc::now().to_rfc3339(), id],
    ).map_err(|e| e.to_string())?;
    let item = conn.query_row(
        "SELECT id, name, qty, unit_price, category, updated_at, synced FROM stock_items WHERE id = ?1",
        params![id],
        |r| Ok(StockItem {
            id: r.get(0)?, name: r.get(1)?, qty: r.get(2)?, unit_price: r.get(3)?,
            category: r.get(4)?, updated_at: r.get(5)?, synced: r.get::<_, i64>(6)? != 0,
        }),
    ).map_err(|e| e.to_string())?;
    if item.qty < 0 {
        log_crash_internal(&conn, "stock", &format!("Negative stock for item {}", item.id));
    }
    let payload = serde_json::to_string(&item).map_err(|e| e.to_string())?;
    enqueue(&conn, "stock_items", &item.id, "update", &payload);
    Ok(item)
}

#[tauri::command]
fn list_stock(db: State<Db>) -> Result<Vec<StockItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, name, qty, unit_price, category, updated_at, synced FROM stock_items ORDER BY category ASC, name ASC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok(StockItem {
            id: r.get(0)?, name: r.get(1)?, qty: r.get(2)?, unit_price: r.get(3)?,
            category: r.get(4)?, updated_at: r.get(5)?, synced: r.get::<_, i64>(6)? != 0,
        })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_stock_item(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM stock_items WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    enqueue(&conn, "stock_items", &id, "delete", "{}");
    Ok(())
}

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
    conn.execute(
        &format!("UPDATE {} SET synced = 1 WHERE id = ?1", table_name),
        params![row_id],
    ).map_err(|e| e.to_string())?;
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
        .timeout(std::time::Duration::from_secs(4))
        .send()
        .await
    {
        Ok(_) => true,
        Err(_) => false,
    }
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
            add_stock_item,
            update_stock_qty,
            list_stock,
            delete_stock_item,
            queue_pending,
            queue_mark_synced,
            log_crash,
            list_crash_logs,
            check_internet
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
