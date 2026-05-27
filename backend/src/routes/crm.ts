import type { FastifyInstance } from "fastify";
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

export async function crmRoutes(app: FastifyInstance): Promise<void> {
  // ---- Customers ----
  app.get("/customers", async (request) => {
    const { enterpriseId, status, search, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    return listCustomers(enterpriseId, {
      status,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  });

  app.get("/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const customer = getCustomer(id);
    if (!customer) return reply.status(404).send({ error: "客户不存在" });
    return reply.send(customer);
  });

  app.post("/customers", async (request, reply) => {
    const parsed = CreateCustomerRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const customer = createCustomer(parsed.data);
    return reply.status(201).send(customer);
  });

  app.patch("/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateCustomerRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const customer = updateCustomer(id, parsed.data);
    if (!customer) return reply.status(404).send({ error: "客户不存在" });
    return reply.send(customer);
  });

  app.delete("/customers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deleteCustomer(id);
    if (!ok) return reply.status(404).send({ error: "客户不存在" });
    return reply.status(204).send();
  });

  // ---- Suppliers ----
  app.get("/suppliers", async (request) => {
    const { enterpriseId, search, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    return listSuppliers(enterpriseId, { search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  });

  app.get("/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const supplier = getSupplier(id);
    if (!supplier) return reply.status(404).send({ error: "供应商不存在" });
    return reply.send(supplier);
  });

  app.post("/suppliers", async (request, reply) => {
    const parsed = CreateSupplierRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const supplier = createSupplier(parsed.data);
    return reply.status(201).send(supplier);
  });

  app.patch("/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateSupplierRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const supplier = updateSupplier(id, parsed.data);
    if (!supplier) return reply.status(404).send({ error: "供应商不存在" });
    return reply.send(supplier);
  });

  app.delete("/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deleteSupplier(id);
    if (!ok) return reply.status(404).send({ error: "供应商不存在" });
    return reply.status(204).send();
  });

  // ---- Products ----
  app.get("/products", async (request) => {
    const { enterpriseId, category, search, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    return listProducts(enterpriseId, { category, search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  });

  app.get("/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = getProduct(id);
    if (!product) return reply.status(404).send({ error: "商品不存在" });
    return reply.send(product);
  });

  app.post("/products", async (request, reply) => {
    const parsed = CreateProductRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const product = createProduct(parsed.data);
    return reply.status(201).send(product);
  });

  app.patch("/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateProductRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const product = updateProduct(id, parsed.data);
    if (!product) return reply.status(404).send({ error: "商品不存在" });
    return reply.send(product);
  });

  app.delete("/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deleteProduct(id);
    if (!ok) return reply.status(404).send({ error: "商品不存在" });
    return reply.status(204).send();
  });
}
