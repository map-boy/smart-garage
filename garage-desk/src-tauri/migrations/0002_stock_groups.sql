CREATE TABLE IF NOT EXISTS stock_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

ALTER TABLE stock_items ADD COLUMN group_id TEXT REFERENCES stock_groups(id);
