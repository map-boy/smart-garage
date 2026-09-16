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

export interface StockItem {
  id: string;
  name: string;
  qty: number;
  unit_price: number;
  category: string;
  updated_at: string;
  synced: boolean;
}

export interface QueueRow {
  id: string;
  table_name: "clients" | "stock_items";
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

export function addStockItem(
  name: string,
  qty: number,
  unit_price: number,
  category: string
): Promise<StockItem> {
  return invoke("add_stock_item", { name, qty, unitPrice: unit_price, category });
}

export function deleteStockItem(id: string): Promise<void> {
  return invoke("delete_stock_item", { id });
}

export function updateStockQty(id: string, delta: number): Promise<StockItem> {
  return invoke("update_stock_qty", { id, delta });
}

export function listStock(): Promise<StockItem[]> {
  return invoke("list_stock");
}

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
