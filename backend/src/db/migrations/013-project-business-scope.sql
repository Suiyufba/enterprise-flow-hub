ALTER TABLE customers ADD COLUMN project_id TEXT;
ALTER TABLE suppliers ADD COLUMN project_id TEXT;
ALTER TABLE products ADD COLUMN project_id TEXT;
ALTER TABLE orders ADD COLUMN project_id TEXT;
ALTER TABLE payments ADD COLUMN project_id TEXT;
ALTER TABLE invoices ADD COLUMN project_id TEXT;
ALTER TABLE tasks ADD COLUMN project_id TEXT;
ALTER TABLE files ADD COLUMN project_id TEXT;

UPDATE customers
SET project_id = (SELECT p.id FROM projects p WHERE p.enterprise_id = customers.enterprise_id ORDER BY p.created_at, p.id LIMIT 1)
WHERE project_id IS NULL;

UPDATE suppliers
SET project_id = (SELECT p.id FROM projects p WHERE p.enterprise_id = suppliers.enterprise_id ORDER BY p.created_at, p.id LIMIT 1)
WHERE project_id IS NULL;

UPDATE products
SET project_id = (SELECT p.id FROM projects p WHERE p.enterprise_id = products.enterprise_id ORDER BY p.created_at, p.id LIMIT 1)
WHERE project_id IS NULL;

UPDATE orders
SET project_id = COALESCE(
  (SELECT c.project_id FROM customers c WHERE c.id = orders.customer_id),
  (SELECT p.id FROM projects p WHERE p.enterprise_id = orders.enterprise_id ORDER BY p.created_at, p.id LIMIT 1)
)
WHERE project_id IS NULL;

UPDATE payments
SET project_id = COALESCE(
  (SELECT o.project_id FROM orders o WHERE o.id = payments.order_id),
  (SELECT p.id FROM projects p WHERE p.enterprise_id = payments.enterprise_id ORDER BY p.created_at, p.id LIMIT 1)
)
WHERE project_id IS NULL;

UPDATE invoices
SET project_id = COALESCE(
  (SELECT o.project_id FROM orders o WHERE o.id = invoices.order_id),
  (SELECT c.project_id FROM customers c WHERE c.id = invoices.customer_id),
  (SELECT p.id FROM projects p WHERE p.enterprise_id = invoices.enterprise_id ORDER BY p.created_at, p.id LIMIT 1)
)
WHERE project_id IS NULL;

UPDATE tasks
SET project_id = COALESCE(
  (SELECT a.project_id FROM automations a WHERE a.id = tasks.source_id AND tasks.source_type = 'automation'),
  (SELECT p.id FROM projects p WHERE p.enterprise_id = tasks.enterprise_id ORDER BY p.created_at, p.id LIMIT 1)
)
WHERE project_id IS NULL;

UPDATE files
SET project_id = COALESCE(
  CASE WHEN related_type = 'project' AND EXISTS (SELECT 1 FROM projects p WHERE p.id = files.related_id AND p.enterprise_id = files.enterprise_id) THEN related_id END,
  (SELECT p.id FROM projects p WHERE p.enterprise_id = files.enterprise_id ORDER BY p.created_at, p.id LIMIT 1)
)
WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_project ON customers(project_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_project ON suppliers(project_id);
CREATE INDEX IF NOT EXISTS idx_products_project ON products(project_id);
CREATE INDEX IF NOT EXISTS idx_orders_project ON orders(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_project ON payments(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);

UPDATE ai_tools
SET description = description || ' 所有业务查询和写入均受当前 projectId 项目范围约束。'
WHERE id IN ('tool-business-query', 'tool-business-action');
