import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { resolveProjectId } from "../project-scope.js";
import type {
  Order, OrderItem, CreateOrderRequest, UpdateOrderRequest,
  Payment, CreatePaymentRequest, UpdatePaymentRequest,
  Invoice, CreateInvoiceRequest, UpdateInvoiceRequest,
  PaginatedList,
} from "shared";

function db() { return getDb(); }

// ---- Order ----

function rowToOrder(r: Record<string, unknown>): Order {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    projectId: (r.project_id as string) || "",
    customerId: (r.customer_id as string) || null,
    status: (r.status as Order["status"]) || "draft",
    totalAmount: (r.total_amount as number) || 0,
    notes: (r.notes as string) || "",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function orderItemsFor(orderId: string): OrderItem[] {
  return (db()
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid ASC")
    .all(orderId) as Record<string, unknown>[])
    .map((r) => ({
      id: r.id as string,
      orderId: r.order_id as string,
      productId: (r.product_id as string) || null,
      quantity: (r.quantity as number) || 0,
      unitPrice: (r.unit_price as number) || 0,
      subtotal: (r.subtotal as number) || 0,
    }));
}

export function listOrders(
  enterpriseId: string,
  opts?: { projectId?: string; status?: string; customerId?: string; search?: string; page?: number; limit?: number },
): PaginatedList<Order> {
  const conds: string[] = ["orders.enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
  if (opts?.projectId) { conds.push("orders.project_id = ?"); params.push(opts.projectId); }
  if (opts?.status) { conds.push("orders.status = ?"); params.push(opts.status); }
  if (opts?.customerId) { conds.push("orders.customer_id = ?"); params.push(opts.customerId); }
  if (opts?.search) {
    conds.push("(orders.id LIKE ? OR customers.name LIKE ? OR orders.notes LIKE ?)");
    params.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`);
  }
  const where = conds.join(" AND ");
  const from = "orders LEFT JOIN customers ON orders.customer_id = customers.id";
  const total = (db().prepare(`SELECT COUNT(*) as cnt FROM ${from} WHERE ${where}`).get(...params) as { cnt: number }).cnt;
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 20;
  const rows = db()
    .prepare(`SELECT orders.* FROM ${from} WHERE ${where} ORDER BY orders.created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as Record<string, unknown>[];
  return { items: rows.map(rowToOrder), total, page, limit };
}

export function getOrder(id: string): (Order & { items: OrderItem[] }) | undefined {
  const row = db().prepare("SELECT * FROM orders WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return { ...rowToOrder(row), items: orderItemsFor(id) };
}

export function createOrder(input: CreateOrderRequest): Order & { items: OrderItem[] } {
  const now = new Date().toISOString();
  const projectId = resolveProjectId(input.enterpriseId, input.projectId);
  let totalAmount = 0;
  const items: OrderItem[] = input.items.map((item) => {
    const subtotal = item.quantity * item.unitPrice;
    totalAmount += subtotal;
    return {
      id: `oi-${randomUUID()}`,
      orderId: "", // filled below
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal,
    };
  });

  const order: Order = {
    id: `ord-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    projectId,
    customerId: input.customerId || null,
    status: "draft",
    totalAmount,
    notes: input.notes ?? "",
    createdAt: now,
    updatedAt: now,
  };

  db()
    .prepare("INSERT INTO orders (id, enterprise_id, project_id, customer_id, status, total_amount, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(order.id, order.enterpriseId, order.projectId, order.customerId, order.status, order.totalAmount, order.notes, order.createdAt, order.updatedAt);

  const insertItem = db().prepare(
    "INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES (?,?,?,?,?,?)",
  );
  for (const item of items) {
    item.orderId = order.id;
    insertItem.run(item.id, item.orderId, item.productId, item.quantity, item.unitPrice, item.subtotal);
  }

  return { ...order, items };
}

export function updateOrder(id: string, input: UpdateOrderRequest): Order | undefined {
  const existing = getOrder(id);
  if (!existing) return undefined;
  const projectId = input.projectId === undefined
    ? existing.projectId
    : resolveProjectId(existing.enterpriseId, input.projectId);
  const status = input.status ?? existing.status;
  const notes = input.notes !== undefined ? input.notes : existing.notes;
  const updatedAt = new Date().toISOString();
  db()
    .prepare("UPDATE orders SET project_id=?, status=?, notes=?, updated_at=? WHERE id=?")
    .run(projectId, status, notes, updatedAt, id);
  return rowToOrder(db().prepare("SELECT * FROM orders WHERE id = ?").get(id) as Record<string, unknown>);
}

export function deleteOrder(id: string): boolean {
  return db().prepare("DELETE FROM orders WHERE id = ?").run(id).changes > 0;
}

// ---- Payment ----

function rowToPayment(r: Record<string, unknown>): Payment {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    projectId: (r.project_id as string) || "",
    orderId: (r.order_id as string) || null,
    amount: (r.amount as number) || 0,
    method: (r.method as Payment["method"]) || "cash",
    status: (r.status as Payment["status"]) || "pending",
    receivedAt: (r.received_at as string) || null,
    createdAt: r.created_at as string,
  };
}

export function listPayments(
  enterpriseId: string,
  opts?: { projectId?: string; orderId?: string; status?: string; page?: number; limit?: number },
): PaginatedList<Payment> {
  const conds: string[] = ["enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
  if (opts?.projectId) { conds.push("project_id = ?"); params.push(opts.projectId); }
  if (opts?.orderId) { conds.push("order_id = ?"); params.push(opts.orderId); }
  if (opts?.status) { conds.push("status = ?"); params.push(opts.status); }
  const where = conds.join(" AND ");
  const total = (db().prepare(`SELECT COUNT(*) as cnt FROM payments WHERE ${where}`).get(...params) as { cnt: number }).cnt;
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 20;
  const rows = db()
    .prepare(`SELECT * FROM payments WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as Record<string, unknown>[];
  return { items: rows.map(rowToPayment), total, page, limit };
}

export function createPayment(input: CreatePaymentRequest): Payment {
  const now = new Date().toISOString();
  const projectId = resolveProjectId(input.enterpriseId, input.projectId);
  const payment: Payment = {
    id: `pay-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    projectId,
    orderId: input.orderId || null,
    amount: input.amount,
    method: input.method ?? "cash",
    status: "completed",
    receivedAt: now,
    createdAt: now,
  };
  db()
    .prepare("INSERT INTO payments (id, enterprise_id, project_id, order_id, amount, method, status, received_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(payment.id, payment.enterpriseId, payment.projectId, payment.orderId, payment.amount, payment.method, payment.status, payment.receivedAt, payment.createdAt);
  return payment;
}

export function getPayment(id: string): Payment | undefined {
  const row = db().prepare("SELECT * FROM payments WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToPayment(row) : undefined;
}

export function updatePayment(id: string, input: UpdatePaymentRequest): Payment | undefined {
  const existing = getPayment(id);
  if (!existing) return undefined;
  const projectId = input.projectId === undefined
    ? existing.projectId
    : resolveProjectId(existing.enterpriseId, input.projectId);
  const status = input.status ?? existing.status;
  const receivedAt = status === "completed" && existing.status !== "completed"
    ? new Date().toISOString()
    : status === "pending" ? null : existing.receivedAt;
  db().prepare(
    "UPDATE payments SET project_id=?, order_id=?, amount=?, method=?, status=?, received_at=? WHERE id=?",
  ).run(
    projectId,
    input.orderId !== undefined ? input.orderId : existing.orderId,
    input.amount ?? existing.amount,
    input.method ?? existing.method,
    status,
    receivedAt,
    id,
  );
  return getPayment(id);
}

// ---- Invoice ----

function rowToInvoice(r: Record<string, unknown>): Invoice {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    projectId: (r.project_id as string) || "",
    orderId: (r.order_id as string) || null,
    customerId: (r.customer_id as string) || null,
    amount: (r.amount as number) || 0,
    status: (r.status as Invoice["status"]) || "draft",
    dueDate: (r.due_date as string) || null,
    issuedAt: (r.issued_at as string) || null,
    createdAt: r.created_at as string,
    invoiceNumber: (r.invoice_number as string) || null,
    invoiceCode: (r.invoice_code as string) || null,
    invoiceType: (r.invoice_type as Invoice["invoiceType"]) || null,
    taxRate: (r.tax_rate as number) ?? null,
    taxAmount: (r.tax_amount as number) ?? null,
    totalAmount: (r.total_amount as number) ?? null,
    buyerName: (r.buyer_name as string) || null,
    buyerTaxId: (r.buyer_tax_id as string) || null,
    sellerName: (r.seller_name as string) || null,
    sellerTaxId: (r.seller_tax_id as string) || null,
    remark: (r.remark as string) || null,
    issuer: (r.issuer as string) || null,
    sourceFileId: (r.source_file_id as string) || null,
  };
}

export function listInvoices(
  enterpriseId: string,
  opts?: { projectId?: string; status?: string; page?: number; limit?: number },
): PaginatedList<Invoice> {
  const conds: string[] = ["enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
  if (opts?.projectId) { conds.push("project_id = ?"); params.push(opts.projectId); }
  if (opts?.status) { conds.push("status = ?"); params.push(opts.status); }
  const where = conds.join(" AND ");
  const total = (db().prepare(`SELECT COUNT(*) as cnt FROM invoices WHERE ${where}`).get(...params) as { cnt: number }).cnt;
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 20;
  const rows = db()
    .prepare(`SELECT * FROM invoices WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as Record<string, unknown>[];
  return { items: rows.map(rowToInvoice), total, page, limit };
}

export function getInvoice(id: string): Invoice | undefined {
  const row = db().prepare("SELECT * FROM invoices WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToInvoice(row) : undefined;
}

export function findInvoiceByIdentity(enterpriseId: string, invoiceNumber: string, invoiceCode?: string | null): Invoice | undefined {
  const normalizedNumber = invoiceNumber.trim();
  if (!normalizedNumber) return undefined;
  const row = invoiceCode?.trim()
    ? db().prepare("SELECT * FROM invoices WHERE enterprise_id = ? AND invoice_number = ? AND invoice_code = ? LIMIT 1")
      .get(enterpriseId, normalizedNumber, invoiceCode.trim()) as Record<string, unknown> | undefined
    : db().prepare("SELECT * FROM invoices WHERE enterprise_id = ? AND invoice_number = ? LIMIT 1")
      .get(enterpriseId, normalizedNumber) as Record<string, unknown> | undefined;
  return row ? rowToInvoice(row) : undefined;
}

export function createInvoice(input: CreateInvoiceRequest): Invoice {
  const now = new Date().toISOString();
  const projectId = resolveProjectId(input.enterpriseId, input.projectId);
  const taxAmount = input.taxAmount ?? (input.taxRate != null ? Math.round(input.amount * input.taxRate * 100) / 100 : 0);
  const totalAmount = input.totalAmount ?? Math.round((input.amount + taxAmount) * 100) / 100;
  const invoice: Invoice = {
    id: `inv-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    projectId,
    orderId: input.orderId || null,
    customerId: input.customerId || null,
    amount: input.amount,
    status: "draft",
    dueDate: input.dueDate || null,
    issuedAt: input.issuedAt || null,
    createdAt: now,
    invoiceNumber: input.invoiceNumber ?? null,
    invoiceCode: input.invoiceCode ?? null,
    invoiceType: input.invoiceType ?? null,
    taxRate: input.taxRate ?? null,
    taxAmount,
    totalAmount,
    buyerName: input.buyerName ?? null,
    buyerTaxId: input.buyerTaxId ?? null,
    sellerName: input.sellerName ?? null,
    sellerTaxId: input.sellerTaxId ?? null,
    remark: input.remark ?? null,
    issuer: input.issuer ?? null,
    sourceFileId: input.sourceFileId ?? null,
  };
  db()
    .prepare(`INSERT INTO invoices (id, enterprise_id, project_id, order_id, customer_id, amount, status, due_date, issued_at, created_at, invoice_number, invoice_code, invoice_type, tax_rate, tax_amount, total_amount, buyer_name, buyer_tax_id, seller_name, seller_tax_id, remark, issuer, source_file_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(invoice.id, invoice.enterpriseId, invoice.projectId, invoice.orderId, invoice.customerId, invoice.amount, invoice.status, invoice.dueDate, invoice.issuedAt, invoice.createdAt, invoice.invoiceNumber, invoice.invoiceCode, invoice.invoiceType, invoice.taxRate, invoice.taxAmount, invoice.totalAmount, invoice.buyerName, invoice.buyerTaxId, invoice.sellerName, invoice.sellerTaxId, invoice.remark, invoice.issuer, invoice.sourceFileId);
  return invoice;
}

export function updateInvoice(id: string, input: UpdateInvoiceRequest): Invoice | null {
  const existing = db().prepare("SELECT * FROM invoices WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return null;
  const projectId = input.projectId === undefined
    ? ((existing.project_id as string) || "")
    : resolveProjectId(existing.enterprise_id as string, input.projectId);

  const keepOrReplace = <T>(value: T | undefined, current: unknown): T | null =>
    value !== undefined ? value : (current as T | null) ?? null;
  const taxRate = keepOrReplace(input.taxRate, existing.tax_rate);
  const amount = input.amount ?? (existing.amount as number);
  const taxAmount = input.taxAmount !== undefined
    ? input.taxAmount
    : input.amount !== undefined || input.taxRate !== undefined
      ? (taxRate != null ? Math.round(amount * taxRate * 100) / 100 : 0)
      : (existing.tax_amount as number | null) ?? 0;
  const totalAmount = input.totalAmount !== undefined
    ? input.totalAmount
    : input.amount !== undefined || input.taxRate !== undefined || input.taxAmount !== undefined
      ? Math.round((amount + (taxAmount ?? 0)) * 100) / 100
      : (existing.total_amount as number | null) ?? amount;

  db().prepare(`UPDATE invoices SET
    project_id = ?, order_id = ?, customer_id = ?, amount = ?, status = ?, due_date = ?, issued_at = ?,
    invoice_number = ?, invoice_code = ?, invoice_type = ?, tax_rate = ?,
    tax_amount = ?, total_amount = ?, buyer_name = ?, buyer_tax_id = ?,
    seller_name = ?, seller_tax_id = ?, remark = ?, issuer = ?, source_file_id = ?
    WHERE id = ?`).run(
    projectId,
    keepOrReplace(input.orderId, existing.order_id),
    keepOrReplace(input.customerId, existing.customer_id),
    amount,
    input.status ?? existing.status ?? "draft",
    keepOrReplace(input.dueDate, existing.due_date),
    keepOrReplace(input.issuedAt, existing.issued_at),
    keepOrReplace(input.invoiceNumber, existing.invoice_number),
    keepOrReplace(input.invoiceCode, existing.invoice_code),
    keepOrReplace(input.invoiceType, existing.invoice_type),
    taxRate,
    taxAmount,
    totalAmount,
    keepOrReplace(input.buyerName, existing.buyer_name),
    keepOrReplace(input.buyerTaxId, existing.buyer_tax_id),
    keepOrReplace(input.sellerName, existing.seller_name),
    keepOrReplace(input.sellerTaxId, existing.seller_tax_id),
    keepOrReplace(input.remark, existing.remark),
    keepOrReplace(input.issuer, existing.issuer),
    keepOrReplace(input.sourceFileId, existing.source_file_id),
    id,
  );
  return rowToInvoice(db().prepare("SELECT * FROM invoices WHERE id = ?").get(id) as Record<string, unknown>);
}

export function deleteInvoice(id: string): boolean {
  const result = db().prepare("DELETE FROM invoices WHERE id = ?").run(id);
  return result.changes > 0;
}
