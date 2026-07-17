import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CreateOrderRequestSchema,
  UpdateOrderRequestSchema,
  CreatePaymentRequestSchema,
  CreateInvoiceRequestSchema,
} from "shared";
import {
  listOrders, getOrder, createOrder, updateOrder, deleteOrder,
  listPayments, createPayment,
  listInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice,
} from "../store/orders.js";
import { canAccessEnterprise } from "./auth-context.js";
import { emitEvent } from "../events/emitter.js";

function requireScope(request: FastifyRequest, reply: FastifyReply, recordEid: string): boolean {
  return canAccessEnterprise(request, recordEid, reply);
}

export async function ordersRoutes(app: FastifyInstance): Promise<void> {
  // ---- Orders ----
  app.get("/orders", async (request, reply) => {
    const { enterpriseId, status, customerId, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listOrders(enterpriseId, { status, customerId, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  });

  app.get("/orders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = getOrder(id);
    if (!order) return reply.status(404).send({ error: "订单不存在" });
    if (!requireScope(request, reply, order.enterpriseId)) return;
    return reply.send(order);
  });

  app.post("/orders", async (request, reply) => {
    const parsed = CreateOrderRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    if (!canAccessEnterprise(request, parsed.data.enterpriseId, reply)) return;
    const order = createOrder(parsed.data);
    emitEvent("create", "order", order.id, order as unknown as Record<string, unknown>, "api");
    return reply.status(201).send(order);
  });

  app.patch("/orders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getOrder(id);
    if (!existing) return reply.status(404).send({ error: "订单不存在" });
    if (!requireScope(request, reply, existing.enterpriseId)) return;
    const parsed = UpdateOrderRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const order = updateOrder(id, parsed.data);
    emitEvent("update", "order", id, order as unknown as Record<string, unknown>, "api");
    if (parsed.data.status && parsed.data.status !== existing.status) {
      emitEvent("status_change", "order", id, order as unknown as Record<string, unknown>, "api");
    }
    return reply.send(order);
  });

  app.delete("/orders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getOrder(id);
    if (!existing) return reply.status(404).send({ error: "订单不存在" });
    if (!requireScope(request, reply, existing.enterpriseId)) return;
    deleteOrder(id);
    emitEvent("delete", "order", id, existing as unknown as Record<string, unknown>, "api");
    return reply.status(204).send();
  });

  // ---- Payments ----
  app.get("/payments", async (request, reply) => {
    const { enterpriseId, orderId, status, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listPayments(enterpriseId, { orderId, status, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  });

  app.post("/payments", async (request, reply) => {
    const parsed = CreatePaymentRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    if (!canAccessEnterprise(request, parsed.data.enterpriseId, reply)) return;
    if (parsed.data.orderId) {
      const order = getOrder(parsed.data.orderId);
      if (!order) {
        return reply.status(400).send({ error: "关联订单不存在", orderId: parsed.data.orderId });
      }
      if (order.enterpriseId !== parsed.data.enterpriseId) {
        return reply.status(403).send({ error: "不能为其他企业订单创建付款" });
      }
    }
    const payment = createPayment(parsed.data);
    emitEvent("create", "payment", payment.id, payment as unknown as Record<string, unknown>, "api");
    return reply.status(201).send(payment);
  });

  // ---- Invoices ----
  app.get("/invoices", async (request, reply) => {
    const { enterpriseId, status, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listInvoices(enterpriseId, { status, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  });

  app.post("/invoices", async (request, reply) => {
    const parsed = CreateInvoiceRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    if (!canAccessEnterprise(request, parsed.data.enterpriseId, reply)) return;
    const invoice = createInvoice(parsed.data);
    emitEvent("create", "invoice", invoice.id, invoice as unknown as Record<string, unknown>, "api");
    return reply.status(201).send(invoice);
  });

  app.patch("/invoices/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getInvoice(id);
    if (!existing) return reply.status(404).send({ error: "发票不存在" });
    if (!requireScope(request, reply, existing.enterpriseId)) return;
    const invoice = updateInvoice(id, request.body as Record<string, unknown>);
    if (!invoice) return reply.status(404).send({ error: "发票不存在" });
    emitEvent("update", "invoice", id, invoice as unknown as Record<string, unknown>, "api");
    const nextStatus = (request.body as Record<string, unknown>).status;
    if (typeof nextStatus === "string" && nextStatus !== existing.status) {
      emitEvent("status_change", "invoice", id, invoice as unknown as Record<string, unknown>, "api");
    }
    return reply.send(invoice);
  });

  app.delete("/invoices/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getInvoice(id);
    if (!existing) return reply.status(404).send({ error: "发票不存在" });
    if (!requireScope(request, reply, existing.enterpriseId)) return;
    const ok = deleteInvoice(id);
    if (!ok) return reply.status(404).send({ error: "发票不存在" });
    emitEvent("delete", "invoice", id, existing as unknown as Record<string, unknown>, "api");
    return reply.status(204).send();
  });
}
