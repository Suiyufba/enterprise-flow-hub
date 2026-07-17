-- Project scope was introduced after these rows were created. Records created
-- after a dedicated customer-management project existed belong to that project,
-- while relational records inherit the corrected project from their parent.
UPDATE customers
SET project_id = (
  SELECT p.id
  FROM projects p
  WHERE p.enterprise_id = customers.enterprise_id AND p.name = '客户管理'
  ORDER BY p.created_at, p.id
  LIMIT 1
)
WHERE created_at >= (
    SELECT p.created_at
    FROM projects p
    WHERE p.enterprise_id = customers.enterprise_id AND p.name = '客户管理'
    ORDER BY p.created_at, p.id
    LIMIT 1
  )
  AND project_id = (
    SELECT p.id
    FROM projects p
    WHERE p.enterprise_id = customers.enterprise_id
    ORDER BY p.created_at, p.id
    LIMIT 1
  );

UPDATE suppliers
SET project_id = (
  SELECT p.id
  FROM projects p
  WHERE p.enterprise_id = suppliers.enterprise_id AND p.name = '客户管理'
  ORDER BY p.created_at, p.id
  LIMIT 1
)
WHERE created_at >= (
    SELECT p.created_at
    FROM projects p
    WHERE p.enterprise_id = suppliers.enterprise_id AND p.name = '客户管理'
    ORDER BY p.created_at, p.id
    LIMIT 1
  )
  AND project_id = (
    SELECT p.id
    FROM projects p
    WHERE p.enterprise_id = suppliers.enterprise_id
    ORDER BY p.created_at, p.id
    LIMIT 1
  );

UPDATE products
SET project_id = (
  SELECT p.id
  FROM projects p
  WHERE p.enterprise_id = products.enterprise_id AND p.name = '客户管理'
  ORDER BY p.created_at, p.id
  LIMIT 1
)
WHERE created_at >= (
    SELECT p.created_at
    FROM projects p
    WHERE p.enterprise_id = products.enterprise_id AND p.name = '客户管理'
    ORDER BY p.created_at, p.id
    LIMIT 1
  )
  AND project_id = (
    SELECT p.id
    FROM projects p
    WHERE p.enterprise_id = products.enterprise_id
    ORDER BY p.created_at, p.id
    LIMIT 1
  );

UPDATE orders
SET project_id = (
  SELECT c.project_id
  FROM customers c
  WHERE c.id = orders.customer_id
)
WHERE customer_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM customers c
    WHERE c.id = orders.customer_id AND c.project_id <> orders.project_id
  );

UPDATE payments
SET project_id = (
  SELECT o.project_id
  FROM orders o
  WHERE o.id = payments.order_id
)
WHERE order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.id = payments.order_id AND o.project_id <> payments.project_id
  );

UPDATE invoices
SET project_id = COALESCE(
  (SELECT o.project_id FROM orders o WHERE o.id = invoices.order_id),
  (SELECT c.project_id FROM customers c WHERE c.id = invoices.customer_id),
  project_id
)
WHERE EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.id = invoices.order_id AND o.project_id <> invoices.project_id
  )
  OR EXISTS (
    SELECT 1
    FROM customers c
    WHERE c.id = invoices.customer_id AND c.project_id <> invoices.project_id
  );
