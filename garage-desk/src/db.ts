import { invoke } from "@tauri-apps/api/core";

export interface Client {
  id: string;
  name: string;
  phone: string;
  vehicle_plate: string;
  vehicle_model: string;
  location: string;
  issue: string;
  created_at: string;
  synced: boolean;
}

export interface Visit {
  id: string;
  client_id: string;
  name: string;
  phone: string;
  vehicle_plate: string;
  vehicle_model: string;
  location: string;
  issue: string;
  visit_date: string;
  created_at: string;
  synced: boolean;
}

export interface StockGroup {
  id: string;
  name: string;
  created_at: string;
  synced: boolean;
}

export interface StockItem {
  id: string;
  name: string;
  qty: number;
  unit_price: number;
  group_id: string | null;
  group_name: string;
  updated_at: string;
  synced: boolean;
}

export interface StockMovement {
  id: string;
  part_id: string;
  part_name: string;
  delta: number;
  qty_after: number;
  reason: string;
  created_at: string;
  synced: boolean;
}

export type SyncTable = "clients" | "stock_items" | "stock_groups" | "stock_movements" | "visits";

export interface QueueRow {
  id: string;
  table_name: SyncTable;
  row_id: string;
  op: "create" | "update" | "delete";
  payload: string;
  created_at: string;
}

export interface CrashLog {
  id: string;
  source: string;
  message: string;
  created_at: string;
}

export type Role = "receptionist" | "stock" | "boss";

export function verifyLogin(password: string): Promise<boolean> {
  return invoke("verify_login", { password });
}

export function addClient(
  name: string,
  phone: string,
  vehicle_plate: string,
  vehicle_model: string,
  location: string,
  issue: string
): Promise<Client> {
  return invoke("add_client", {
    name,
    phone,
    vehiclePlate: vehicle_plate,
    vehicleModel: vehicle_model,
    location,
    issue,
  });
}

export function deleteClient(id: string): Promise<void> {
  return invoke("delete_client", { id });
}

export function listClients(): Promise<Client[]> {
  return invoke("list_clients");
}

/* ---- visits ---- */

export function addVisit(
  client_id: string | null,
  name: string,
  phone: string,
  vehicle_plate: string,
  vehicle_model: string,
  location: string,
  issue: string,
  visit_date: string | null
): Promise<Visit> {
  return invoke("add_visit", {
    clientId: client_id,
    name,
    phone,
    vehiclePlate: vehicle_plate,
    vehicleModel: vehicle_model,
    location,
    issue,
    visitDate: visit_date,
  });
}

export function updateVisit(
  id: string,
  name: string,
  phone: string,
  vehicle_plate: string,
  vehicle_model: string,
  location: string,
  visit_date: string
): Promise<Visit> {
  return invoke("update_visit", {
    id,
    name,
    phone,
    vehiclePlate: vehicle_plate,
    vehicleModel: vehicle_model,
    location,
    visitDate: visit_date,
  });
}

export function listVisits(): Promise<Visit[]> {
  return invoke("list_visits");
}

export function deleteVisit(id: string): Promise<void> {
  return invoke("delete_visit", { id });
}

/* ---- stock groups ---- */

export function listStockGroups(): Promise<StockGroup[]> {
  return invoke("list_stock_groups");
}

export function addStockGroup(name: string): Promise<StockGroup> {
  return invoke("add_stock_group", { name });
}

export function renameStockGroup(id: string, name: string): Promise<StockGroup> {
  return invoke("rename_stock_group", { id, name });
}

export function deleteStockGroup(id: string): Promise<void> {
  return invoke("delete_stock_group", { id });
}

/* ---- stock items ---- */

export function addStockItem(
  name: string,
  qty: number,
  unit_price: number,
  group_id: string | null
): Promise<StockItem> {
  return invoke("add_stock_item", { name, qty, unitPrice: unit_price, groupId: group_id });
}

export function deleteStockItem(id: string): Promise<void> {
  return invoke("delete_stock_item", { id });
}

export function updateStockQty(id: string, delta: number): Promise<StockItem> {
  return invoke("update_stock_qty", { id, delta });
}

export function setStockItemGroup(id: string, group_id: string): Promise<StockItem> {
  return invoke("set_stock_item_group", { id, groupId: group_id });
}

export function listStock(): Promise<StockItem[]> {
  return invoke("list_stock");
}

export function listStockMovements(): Promise<StockMovement[]> {
  return invoke("list_stock_movements");
}

/* ---- sync queue ---- */

export function queuePending(): Promise<QueueRow[]> {
  return invoke("queue_pending");
}

export function queueMarkSynced(
  queue_id: string,
  table_name: string,
  row_id: string
): Promise<void> {
  return invoke("queue_mark_synced", { queueId: queue_id, tableName: table_name, rowId: row_id });
}

export function logCrash(source: string, message: string): Promise<void> {
  return invoke("log_crash", { source, message });
}

export function listCrashLogs(): Promise<CrashLog[]> {
  return invoke("list_crash_logs");
}

export function checkInternet(): Promise<boolean> {
  return invoke("check_internet");
}
export function exportReport(kind: string, date: string): Promise<string> {
  return invoke("export_report", { kind, date });
}

