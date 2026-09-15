import { doc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
import Database from "@tauri-apps/plugin-sql";

export async function deleteLocalAndQueue(
  sqlite: Database,
  table: "clients" | "stock_items",
  id: string,
  garageId: string
) {
  await sqlite.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
  await sqlite.execute(
    `INSERT INTO sync_queue (op, table_name, row_id, garage_id, created_at) VALUES ('delete', ?, ?, ?, datetime('now'))`,
    [table, id, garageId]
  );
}

export async function syncDelete(table: string, garageId: string, id: string) {
  await deleteDoc(doc(db, "garages", garageId, table, id));
}
