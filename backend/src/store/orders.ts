import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import type {
  Order, OrderItem, CreateOrderRequest, UpdateOrderRequest,
  Payment, CreatePaymentRequest,
  Invoice, CreateInvoiceRequest,
  PaginatedList,
} from "shared";

function db() { return getDb(); }

// ---- Order ----

function rowToOrder(r: Record<string, unknown>): Order {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
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
  opts?: { status?: string; customerId?: string; search?: string; page?: number; limit?: number },
): PaginatedList<Order> {
  const conds: string[] = ["orders.enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
  if (opts?.status) { conds.push("orders.status = ?"); params.push(opts.status); }
  if (opts?.customerId) { conds.push("orders.customer_id = ?"); params.push(opts.customerId); }
  if (opts?.search) {
    conds.push("(customers.name LIKE ? OR orders.notes LIKE ?)");
    params.push(`%${opts.search}%`, `%${opts.search}%`);
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
    customerId: input.customerId || null,
    status: "draft",
    totalAmount,
    notes: input.notes ?? "",
    createdAt: now,
    updatedAt: now,
  };

  db()
    .prepare("INSERT INTO orders (id, enterprise_id, customer_id, status, total_amount, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(order.id, order.enterpriseId, order.customerId, order.status, order.totalAmount, order.notes, order.createdAt, order.updatedAt);

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
  const status = input.status ?? existing.status;
  const notes = input.notes !== undefined ? input.notes : existing.notes;
  const updatedAt = new Date().toISOString();
  db()
    .prepare("UPDATE orders SET status=?, notes=?, updated_at=? WHERE id=?")
    .run(status, notes, updatedAt, id);
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
  opts?: { orderId?: string; status?: string; page?: number; limit?: number },
): PaginatedList<Payment> {
  const conds: string[] = ["enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
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
  const payment: Payment = {
    id: `pay-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    orderId: input.orderId || null,
    amount: input.amount,
    method: input.method ?? "cash",
    status: "completed",
    receivedAt: now,
    createdAt: now,
  };
  db()
    .prepare("INSERT INTO payments (id, enterprise_id, order_id, amount, method, status, received_at, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(payment.id, payment.enterpriseId, payment.orderId, payment.amount, payment.method, payment.status, payment.receivedAt, payment.createdAt);
  return payment;
}

// ---- Invoice ----

function rowToInvoice(r: Record<string, unknown>): Invoice {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    orderId: (r.order_id as string) || null,
    customerId: (r.customer_id as string) || null,
    amount: (r.amount as number) || 0,
    status: (r.status as Invoice["status"]) || "draft",
    dueDate: (r.due_date as string) || null,
    issuedAt: (r.issued_at as string) || null,
    createdAt: r.created_at as string,
  };
}

export function listInvoices(
  enterpriseId: string,
  opts?: { status?: string; page?: number; limit?: number },
): PaginatedList<Invoice> {
  const conds: string[] = ["enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
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

export function createInvoice(input: CreateInvoiceRequest): Invoice {
  const now = new Date().toISOString();
  const invoice: Invoice = {
    id: `inv-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    orderId: input.orderId || null,
    customerId: input.customerId || null,
    amount: input.amount,
    status: "draft",
    dueDate: input.dueDate || null,
    issuedAt: null,
    createdAt: now,
  };
  db()
    .prepare("INSERT INTO invoices (id, enterprise_id, order_id, customer_id, amount, status, due_date, issued_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(invoice.id, invoice.enterpriseId, invoice.orderId, invoice.customerId, invoice.amount, invoice.status, invoice.dueDate, invoice.issuedAt, invoice.createdAt);
  return invoice;
}
