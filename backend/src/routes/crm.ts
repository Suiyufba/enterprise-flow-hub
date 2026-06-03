import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CreateCustomerRequestSchema,
  UpdateCustomerRequestSchema,
  CreateSupplierRequestSchema,
  UpdateSupplierRequestSchema,
  CreateProductRequestSchema,
  UpdateProductRequestSchema,
} from "shared";
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../store/crm.js";
import { getCallerEnterprise } from "./auth-context.js";

function requireEnterpriseScope(
  request: FastifyRequest,
  reply: FastifyReply,
  recordEnterpriseId: string,
): boolean {
  const actorEid = getCallerEnterprise(request, reply);
  if (!actorEid) return false;
  if (actorEid !== recordEnterpriseId) {
    reply.status(403).send({ error: "无权操作其他企业的资源" });
    return false;
  }
  return true;
}

export async function crmRoutes(app: FastifyInstance): Promise<void> {
  // ---- Customers ----
  app.get("/customers", async (request, reply) => {
    const { enterpriseId, status, search, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (actorEid !== enterpriseId) return reply.status(403).send({ error: "无权查看其他企业数据" });
    return listCustomers(enterpriseId, {
      status, search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  });

  app.get("/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const customer = getCustomer(id);
    if (!customer) return reply.status(404).send({ error: "客户不存在" });
    if (!requireEnterpriseScope(request, reply, customer.enterpriseId)) return;
    return reply.send(customer);
  });

  app.post("/customers", async (request, reply) => {
    const parsed = CreateCustomerRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (parsed.data.enterpriseId !== actorEid) {
      return reply.status(403).send({ error: "不能为其他企业创建客户" });
    }
    const customer = createCustomer(parsed.data);
    return reply.status(201).send(customer);
  });

  app.patch("/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getCustomer(id);
    if (!existing) return reply.status(404).send({ error: "客户不存在" });
    if (!requireEnterpriseScope(request, reply, existing.enterpriseId)) return;
    const parsed = UpdateCustomerRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const customer = updateCustomer(id, parsed.data);
    return reply.send(customer);
  });

  app.delete("/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getCustomer(id);
    if (!existing) return reply.status(404).send({ error: "客户不存在" });
    if (!requireEnterpriseScope(request, reply, existing.enterpriseId)) return;
    deleteCustomer(id);
    return reply.status(204).send();
  });

  // ---- Suppliers ----
  app.get("/suppliers", async (request, reply) => {
    const { enterpriseId, search, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (actorEid !== enterpriseId) return reply.status(403).send({ error: "无权查看其他企业数据" });
    return listSuppliers(enterpriseId, { search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  });

  app.get("/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const supplier = getSupplier(id);
    if (!supplier) return reply.status(404).send({ error: "供应商不存在" });
    if (!requireEnterpriseScope(request, reply, supplier.enterpriseId)) return;
    return reply.send(supplier);
  });

  app.post("/suppliers", async (request, reply) => {
    const parsed = CreateSupplierRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (parsed.data.enterpriseId !== actorEid) {
      return reply.status(403).send({ error: "不能为其他企业创建供应商" });
    }
    const supplier = createSupplier(parsed.data);
    return reply.status(201).send(supplier);
  });

  app.patch("/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getSupplier(id);
    if (!existing) return reply.status(404).send({ error: "供应商不存在" });
    if (!requireEnterpriseScope(request, reply, existing.enterpriseId)) return;
    const parsed = UpdateSupplierRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const supplier = updateSupplier(id, parsed.data);
    return reply.send(supplier);
  });

  app.delete("/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getSupplier(id);
    if (!existing) return reply.status(404).send({ error: "供应商不存在" });
    if (!requireEnterpriseScope(request, reply, existing.enterpriseId)) return;
    deleteSupplier(id);
    return reply.status(204).send();
  });

  // ---- Products ----
  app.get("/products", async (request, reply) => {
    const { enterpriseId, category, search, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (actorEid !== enterpriseId) return reply.status(403).send({ error: "无权查看其他企业数据" });
    return listProducts(enterpriseId, { category, search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  });

  app.get("/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = getProduct(id);
    if (!product) return reply.status(404).send({ error: "商品不存在" });
    if (!requireEnterpriseScope(request, reply, product.enterpriseId)) return;
    return reply.send(product);
  });

  app.post("/products", async (request, reply) => {
    const parsed = CreateProductRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (parsed.data.enterpriseId !== actorEid) {
      return reply.status(403).send({ error: "不能为其他企业创建商品" });
    }
    const product = createProduct(parsed.data);
    return reply.status(201).send(product);
  });

  app.patch("/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getProduct(id);
    if (!existing) return reply.status(404).send({ error: "商品不存在" });
    if (!requireEnterpriseScope(request, reply, existing.enterpriseId)) return;
    const parsed = UpdateProductRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const product = updateProduct(id, parsed.data);
    return reply.send(product);
  });

  app.delete("/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getProduct(id);
    if (!existing) return reply.status(404).send({ error: "商品不存在" });
    if (!requireEnterpriseScope(request, reply, existing.enterpriseId)) return;
    deleteProduct(id);
    return reply.status(204).send();
  });
}
