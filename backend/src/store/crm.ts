import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { resolveProjectId } from "../project-scope.js";
import type {
  Customer,
  CreateCustomerRequest,
  UpdateCustomerRequest,
  Supplier,
  CreateSupplierRequest,
  UpdateSupplierRequest,
  Product,
  CreateProductRequest,
  UpdateProductRequest,
  PaginatedList,
} from "shared";

function db() {
  return getDb();
}

function jsonParse<T>(val: string | undefined | null, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

// ---- Customer ----

function rowToCustomer(r: Record<string, unknown>): Customer {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    projectId: (r.project_id as string) || "",
    name: r.name as string,
    contact: (r.contact as string) || "",
    phone: (r.phone as string) || "",
    email: (r.email as string) || "",
    address: (r.address as string) || "",
    gender: (r.gender as Customer["gender"]) || "unknown",
    tags: jsonParse<string[]>(r.tags as string, []),
    status: (r.status as Customer["status"]) || "active",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function listCustomers(
  enterpriseId: string,
  opts?: { projectId?: string; status?: string; search?: string; page?: number; limit?: number },
): PaginatedList<Customer> {
  const conditions: string[] = ["enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
  if (opts?.projectId) { conditions.push("project_id = ?"); params.push(opts.projectId); }
  if (opts?.status) { conditions.push("status = ?"); params.push(opts.status); }
  if (opts?.search) {
    conditions.push("(name LIKE ? OR contact LIKE ? OR phone LIKE ? OR email LIKE ? OR tags LIKE ?)");
    for (let index = 0; index < 5; index += 1) params.push(`%${opts.search}%`);
  }
  const where = conditions.join(" AND ");
  const total = (db().prepare(`SELECT COUNT(*) as cnt FROM customers WHERE ${where}`).get(...params) as { cnt: number }).cnt;
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 20;
  const rows = db()
    .prepare(`SELECT * FROM customers WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as Record<string, unknown>[];
  return { items: rows.map(rowToCustomer), total, page, limit };
}

export function getCustomer(id: string): Customer | undefined {
  const row = db().prepare("SELECT * FROM customers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToCustomer(row) : undefined;
}

export function createCustomer(input: CreateCustomerRequest): Customer {
  const now = new Date().toISOString();
  const projectId = resolveProjectId(input.enterpriseId, input.projectId);
  const cust: Customer = {
    id: `cust-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    projectId,
    name: input.name.trim(),
    contact: input.contact ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    address: input.address ?? "",
    gender: input.gender ?? "unknown",
    tags: input.tags ?? [],
    status: input.status ?? "active",
    createdAt: now,
    updatedAt: now,
  };
  db()
    .prepare("INSERT INTO customers (id, enterprise_id, project_id, name, contact, phone, email, address, gender, tags, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(cust.id, cust.enterpriseId, cust.projectId, cust.name, cust.contact, cust.phone, cust.email, cust.address, cust.gender, JSON.stringify(cust.tags), cust.status, cust.createdAt, cust.updatedAt);
  return cust;
}

export function updateCustomer(id: string, input: UpdateCustomerRequest): Customer | undefined {
  const existing = getCustomer(id);
  if (!existing) return undefined;
  const enterpriseId = input.enterpriseId ?? existing.enterpriseId;
  if (enterpriseId !== existing.enterpriseId) {
    const hasRelations = db().prepare("SELECT EXISTS(SELECT 1 FROM orders WHERE customer_id = ?) OR EXISTS(SELECT 1 FROM invoices WHERE customer_id = ?) AS value").get(id, id) as { value: number };
    if (hasRelations.value) throw new Error("该客户已有订单或发票，不能直接迁移到其他企业");
  }
  const projectId = input.projectId === undefined && enterpriseId === existing.enterpriseId
    ? existing.projectId
    : resolveProjectId(enterpriseId, input.projectId);
  const next = {
    enterpriseId,
    projectId,
    name: input.name ?? existing.name,
    contact: input.contact !== undefined ? input.contact : existing.contact,
    phone: input.phone !== undefined ? input.phone : existing.phone,
    email: input.email !== undefined ? input.email : existing.email,
    address: input.address !== undefined ? input.address : existing.address,
    gender: input.gender ?? existing.gender,
    tags: input.tags !== undefined ? input.tags : existing.tags,
    status: input.status ?? existing.status,
    updated_at: new Date().toISOString(),
  };
  db()
    .prepare("UPDATE customers SET enterprise_id=?, project_id=?, name=?, contact=?, phone=?, email=?, address=?, gender=?, tags=?, status=?, updated_at=? WHERE id=?")
    .run(next.enterpriseId, next.projectId, next.name, next.contact, next.phone, next.email, next.address, next.gender, JSON.stringify(next.tags), next.status, next.updated_at, id);
  return getCustomer(id)!;
}

export function deleteCustomer(id: string): boolean {
  return db().prepare("DELETE FROM customers WHERE id = ?").run(id).changes > 0;
}

// ---- Supplier ----

function rowToSupplier(r: Record<string, unknown>): Supplier {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    projectId: (r.project_id as string) || "",
    name: r.name as string,
    contact: (r.contact as string) || "",
    phone: (r.phone as string) || "",
    email: (r.email as string) || "",
    address: (r.address as string) || "",
    tags: jsonParse<string[]>(r.tags as string, []),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function listSuppliers(
  enterpriseId: string,
  opts?: { projectId?: string; search?: string; page?: number; limit?: number },
): PaginatedList<Supplier> {
  const conditions = ["enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
  if (opts?.projectId) { conditions.push("project_id = ?"); params.push(opts.projectId); }
  if (opts?.search) {
    conditions.push("(name LIKE ? OR contact LIKE ? OR phone LIKE ? OR email LIKE ? OR tags LIKE ?)");
    for (let index = 0; index < 5; index += 1) params.push(`%${opts.search}%`);
  }
  const where = conditions.join(" AND ");
  const total = (db().prepare(`SELECT COUNT(*) as cnt FROM suppliers WHERE ${where}`).get(...params) as { cnt: number }).cnt;
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 20;
  const rows = db()
    .prepare(`SELECT * FROM suppliers WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as Record<string, unknown>[];
  return { items: rows.map(rowToSupplier), total, page, limit };
}

export function getSupplier(id: string): Supplier | undefined {
  const row = db().prepare("SELECT * FROM suppliers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToSupplier(row) : undefined;
}

export function createSupplier(input: CreateSupplierRequest): Supplier {
  const now = new Date().toISOString();
  const projectId = resolveProjectId(input.enterpriseId, input.projectId);
  const sup: Supplier = {
    id: `sup-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    projectId,
    name: input.name.trim(),
    contact: input.contact ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    address: input.address ?? "",
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };
  db()
    .prepare("INSERT INTO suppliers (id, enterprise_id, project_id, name, contact, phone, email, address, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(sup.id, sup.enterpriseId, sup.projectId, sup.name, sup.contact, sup.phone, sup.email, sup.address, JSON.stringify(sup.tags), sup.createdAt, sup.updatedAt);
  return sup;
}

export function updateSupplier(id: string, input: UpdateSupplierRequest): Supplier | undefined {
  const existing = getSupplier(id);
  if (!existing) return undefined;
  const enterpriseId = input.enterpriseId ?? existing.enterpriseId;
  const projectId = input.projectId === undefined && enterpriseId === existing.enterpriseId
    ? existing.projectId
    : resolveProjectId(enterpriseId, input.projectId);
  const next = {
    enterpriseId,
    projectId,
    name: input.name ?? existing.name,
    contact: input.contact !== undefined ? input.contact : existing.contact,
    phone: input.phone !== undefined ? input.phone : existing.phone,
    email: input.email !== undefined ? input.email : existing.email,
    address: input.address !== undefined ? input.address : existing.address,
    tags: input.tags !== undefined ? input.tags : existing.tags,
    updated_at: new Date().toISOString(),
  };
  db()
    .prepare("UPDATE suppliers SET enterprise_id=?, project_id=?, name=?, contact=?, phone=?, email=?, address=?, tags=?, updated_at=? WHERE id=?")
    .run(next.enterpriseId, next.projectId, next.name, next.contact, next.phone, next.email, next.address, JSON.stringify(next.tags), next.updated_at, id);
  return getSupplier(id)!;
}

export function deleteSupplier(id: string): boolean {
  return db().prepare("DELETE FROM suppliers WHERE id = ?").run(id).changes > 0;
}

// ---- Product ----

function rowToProduct(r: Record<string, unknown>): Product {
  const unitPrice = (r.unit_price as number) || 0;
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    projectId: (r.project_id as string) || "",
    name: r.name as string,
    sku: (r.sku as string) || "",
    category: (r.category as string) || "",
    unitPrice,
    price: unitPrice,
    unit: (r.unit as string) || "个",
    description: (r.description as string) || "",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function listProducts(
  enterpriseId: string,
  opts?: { projectId?: string; category?: string; search?: string; page?: number; limit?: number },
): PaginatedList<Product> {
  const conditions = ["enterprise_id = ?"];
  const params: unknown[] = [enterpriseId];
  if (opts?.projectId) { conditions.push("project_id = ?"); params.push(opts.projectId); }
  if (opts?.category) { conditions.push("category = ?"); params.push(opts.category); }
  if (opts?.search) { conditions.push("(name LIKE ? OR sku LIKE ?)"); params.push(`%${opts.search}%`, `%${opts.search}%`); }
  const where = conditions.join(" AND ");
  const total = (db().prepare(`SELECT COUNT(*) as cnt FROM products WHERE ${where}`).get(...params) as { cnt: number }).cnt;
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 20;
  const rows = db()
    .prepare(`SELECT * FROM products WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as Record<string, unknown>[];
  return { items: rows.map(rowToProduct), total, page, limit };
}

export function getProduct(id: string): Product | undefined {
  const row = db().prepare("SELECT * FROM products WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToProduct(row) : undefined;
}

export function createProduct(input: CreateProductRequest): Product {
  const now = new Date().toISOString();
  const projectId = resolveProjectId(input.enterpriseId, input.projectId);
  const prod: Product = {
    id: `prod-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    projectId,
    name: input.name.trim(),
    sku: input.sku ?? "",
    category: input.category ?? "",
    unitPrice: input.unitPrice ?? 0,
    price: input.unitPrice ?? 0,
    unit: input.unit ?? "个",
    description: input.description ?? "",
    createdAt: now,
    updatedAt: now,
  };
  db()
    .prepare("INSERT INTO products (id, enterprise_id, project_id, name, sku, category, unit_price, unit, description, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(prod.id, prod.enterpriseId, prod.projectId, prod.name, prod.sku, prod.category, prod.unitPrice, prod.unit, prod.description, prod.createdAt, prod.updatedAt);
  return prod;
}

export function updateProduct(id: string, input: UpdateProductRequest): Product | undefined {
  const existing = getProduct(id);
  if (!existing) return undefined;
  const enterpriseId = input.enterpriseId ?? existing.enterpriseId;
  if (enterpriseId !== existing.enterpriseId) {
    const hasOrderItems = db().prepare("SELECT EXISTS(SELECT 1 FROM order_items WHERE product_id = ?) AS value").get(id) as { value: number };
    if (hasOrderItems.value) throw new Error("该商品已被订单引用，不能直接迁移到其他企业");
  }
  const projectId = input.projectId === undefined && enterpriseId === existing.enterpriseId
    ? existing.projectId
    : resolveProjectId(enterpriseId, input.projectId);
  const next = {
    enterpriseId,
    projectId,
    name: input.name ?? existing.name,
    sku: input.sku !== undefined ? input.sku : existing.sku,
    category: input.category !== undefined ? input.category : existing.category,
    unit_price: input.unitPrice !== undefined ? input.unitPrice : existing.unitPrice,
    unit: input.unit !== undefined ? input.unit : existing.unit,
    description: input.description !== undefined ? input.description : existing.description,
    updated_at: new Date().toISOString(),
  };
  db()
    .prepare("UPDATE products SET enterprise_id=?, project_id=?, name=?, sku=?, category=?, unit_price=?, unit=?, description=?, updated_at=? WHERE id=?")
    .run(next.enterpriseId, next.projectId, next.name, next.sku, next.category, next.unit_price, next.unit, next.description, next.updated_at, id);
  return getProduct(id)!;
}

export function deleteProduct(id: string): boolean {
  return db().prepare("DELETE FROM products WHERE id = ?").run(id).changes > 0;
}
