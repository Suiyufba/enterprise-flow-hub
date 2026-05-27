-- Phase 3: Orders, Payments, Invoices

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','confirmed','processing','shipped','delivered','cancelled','refunded')),
  total_amount  REAL NOT NULL DEFAULT 0,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  TEXT REFERENCES products(id) ON DELETE SET NULL,
  quantity    REAL NOT NULL DEFAULT 1,
  unit_price  REAL NOT NULL DEFAULT 0,
  subtotal    REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id            TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  order_id      TEXT REFERENCES orders(id) ON DELETE SET NULL,
  amount        REAL NOT NULL,
  method        TEXT NOT NULL DEFAULT 'cash'
                CHECK (method IN ('cash','bank_transfer','alipay','wechat','credit_card','other')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','completed','failed','refunded')),
  received_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  order_id      TEXT REFERENCES orders(id) ON DELETE SET NULL,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  amount        REAL NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','issued','paid','overdue','cancelled')),
  due_date      TEXT,
  issued_at     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_enterprise   ON orders(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer     ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_enterprise ON payments(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_payments_order      ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_enterprise ON invoices(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order      ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer   ON invoices(customer_id);
