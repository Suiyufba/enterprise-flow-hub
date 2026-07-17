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
import { canAccessEnterprise } from "./auth-context.js";
import { emitEvent } from "../events/emitter.js";
import { projectBelongsToEnterprise } from "../project-scope.js";

function requireEnterpriseScope(
  request: FastifyRequest,
  reply: FastifyReply,
  recordEnterpriseId: string,
): boolean {
  return canAccessEnterprise(request, recordEnterpriseId, reply);
}

export async function crmRoutes(app: FastifyInstance): Promise<void> {
  // ---- Customers ----
  app.get("/customers", async (request, reply) => {
    const { enterpriseId, projectId, status, search, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listCustomers(enterpriseId, {
      projectId, status, search,
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
    if (!canAccessEnterprise(request, parsed.data.enterpriseId, reply)) return;
    if (parsed.data.projectId && !projectBelongsToEnterprise(parsed.data.projectId, parsed.data.enterpriseId)) {
      return reply.status(400).send({ error: "项目不存在或不属于当前企业" });
    }
    let customer;
    try { customer = createCustomer(parsed.data); }
    catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : "创建客户失败" }); }
    emitEvent("create", "customer", customer.id, customer as unknown as Record<string, unknown>, "api");
    return reply.status(201).send(customer);
  });

  app.patch("/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getCustomer(id);
    if (!existing) return reply.status(404).send({ error: "客户不存在" });
    if (!requireEnterpriseScope(request, reply, existing.enterpriseId)) return;
    const parsed = UpdateCustomerRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const targetEnterpriseId = parsed.data.enterpriseId ?? existing.enterpriseId;
    if (!canAccessEnterprise(request, targetEnterpriseId, reply)) return;
    if (parsed.data.projectId && !projectBelongsToEnterprise(parsed.data.projectId, targetEnterpriseId)) {
      return reply.status(400).send({ error: "项目不存在或不属于当前企业" });
    }
    let customer;
    try { customer = updateCustomer(id, parsed.data); }
    catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : "更新客户失败" }); }
    emitEvent("update", "customer", id, customer as unknown as Record<string, unknown>, "api");
    if (parsed.data.status && parsed.data.status !== existing.status) {
      emitEvent("status_change", "customer", id, customer as unknown as Record<string, unknown>, "api");
    }
    return reply.send(customer);
  });

  app.delete("/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getCustomer(id);
    if (!existing) return reply.status(404).send({ error: "客户不存在" });
    if (!requireEnterpriseScope(request, reply, existing.enterpriseId)) return;
    deleteCustomer(id);
    emitEvent("delete", "customer", id, existing as unknown as Record<string, unknown>, "api");
    return reply.status(204).send();
  });

  // ---- Suppliers ----
  app.get("/suppliers", async (request, reply) => {
    const { enterpriseId, projectId, search, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listSuppliers(enterpriseId, { projectId, search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
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
    if (!canAccessEnterprise(request, parsed.data.enterpriseId, reply)) return;
    if (parsed.data.projectId && !projectBelongsToEnterprise(parsed.data.projectId, parsed.data.enterpriseId)) {
      return reply.status(400).send({ error: "项目不存在或不属于当前企业" });
    }
    let supplier;
    try { supplier = createSupplier(parsed.data); }
    catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : "创建供应商失败" }); }
    emitEvent("create", "supplier", supplier.id, supplier as unknown as Record<string, unknown>, "api");
    return reply.status(201).send(supplier);
  });

  app.patch("/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getSupplier(id);
    if (!existing) return reply.status(404).send({ error: "供应商不存在" });
    if (!requireEnterpriseScope(request, reply, existing.enterpriseId)) return;
    const parsed = UpdateSupplierRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const targetEnterpriseId = parsed.data.enterpriseId ?? existing.enterpriseId;
    if (!canAccessEnterprise(request, targetEnterpriseId, reply)) return;
    if (parsed.data.projectId && !projectBelongsToEnterprise(parsed.data.projectId, targetEnterpriseId)) {
      return reply.status(400).send({ error: "项目不存在或不属于当前企业" });
    }
    const supplier = updateSupplier(id, parsed.data);
    emitEvent("update", "supplier", id, supplier as unknown as Record<string, unknown>, "api");
    return reply.send(supplier);
  });

  app.delete("/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getSupplier(id);
    if (!existing) return reply.status(404).send({ error: "供应商不存在" });
    if (!requireEnterpriseScope(request, reply, existing.enterpriseId)) return;
    deleteSupplier(id);
    emitEvent("delete", "supplier", id, existing as unknown as Record<string, unknown>, "api");
    return reply.status(204).send();
  });

  // ---- Products ----
  app.get("/products", async (request, reply) => {
    const { enterpriseId, projectId, category, search, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listProducts(enterpriseId, { projectId, category, search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
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
    if (!canAccessEnterprise(request, parsed.data.enterpriseId, reply)) return;
    if (parsed.data.projectId && !projectBelongsToEnterprise(parsed.data.projectId, parsed.data.enterpriseId)) {
      return reply.status(400).send({ error: "项目不存在或不属于当前企业" });
    }
    let product;
    try { product = createProduct(parsed.data); }
    catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : "创建商品失败" }); }
    emitEvent("create", "product", product.id, product as unknown as Record<string, unknown>, "api");
    return reply.status(201).send(product);
  });

  app.patch("/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getProduct(id);
    if (!existing) return reply.status(404).send({ error: "商品不存在" });
    if (!requireEnterpriseScope(request, reply, existing.enterpriseId)) return;
    const parsed = UpdateProductRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const targetEnterpriseId = parsed.data.enterpriseId ?? existing.enterpriseId;
    if (!canAccessEnterprise(request, targetEnterpriseId, reply)) return;
    if (parsed.data.projectId && !projectBelongsToEnterprise(parsed.data.projectId, targetEnterpriseId)) {
      return reply.status(400).send({ error: "项目不存在或不属于当前企业" });
    }
    let product;
    try { product = updateProduct(id, parsed.data); }
    catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : "更新商品失败" }); }
    emitEvent("update", "product", id, product as unknown as Record<string, unknown>, "api");
    return reply.send(product);
  });

  app.delete("/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getProduct(id);
    if (!existing) return reply.status(404).send({ error: "商品不存在" });
    if (!requireEnterpriseScope(request, reply, existing.enterpriseId)) return;
    deleteProduct(id);
    emitEvent("delete", "product", id, existing as unknown as Record<string, unknown>, "api");
    return reply.status(204).send();
  });
}
