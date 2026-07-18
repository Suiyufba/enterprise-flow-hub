-- Phase 2: CRM Business Objects

CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  contact       TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  tags          TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','inactive','lead','lost')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id            TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  contact       TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  sku           TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '',
  unit_price    REAL NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL DEFAULT '个',
  description   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_enterprise ON customers(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_customers_status     ON customers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_enterprise ON suppliers(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_products_enterprise  ON products(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category);
