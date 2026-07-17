import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  CreateOrderRequestSchema,
  UpdateOrderRequestSchema,
  CreatePaymentRequestSchema,
  UpdatePaymentRequestSchema,
  CreateInvoiceRequestSchema,
  UpdateInvoiceRequestSchema,
} from "shared";
import {
  listOrders, getOrder, createOrder, updateOrder, deleteOrder,
  listPayments, getPayment, createPayment, updatePayment,
  listInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice,
} from "../store/orders.js";
import { getCustomer } from "../store/crm.js";
import { canAccessEnterprise } from "./auth-context.js";
import { emitEvent } from "../events/emitter.js";

function requireScope(request: FastifyRequest, reply: FastifyReply, recordEid: string): boolean {
  return canAccessEnterprise(request, recordEid, reply);
}

export async function ordersRoutes(app: FastifyInstance): Promise<void> {
  // ---- Orders ----
  app.get("/orders", async (request, reply) => {
    const { enterpriseId, status, customerId, search, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listOrders(enterpriseId, { status, customerId, search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
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
    if (parsed.data.status && parsed.data.status !== existing.status) {
      const allowedTransitions: Record<string, string[]> = {
        draft: ["confirmed", "cancelled"], confirmed: ["processing", "cancelled"],
        processing: ["shipped", "cancelled"], shipped: ["delivered"],
        delivered: ["refunded"], cancelled: [], refunded: [],
      };
      if (!allowedTransitions[existing.status]?.includes(parsed.data.status)) {
        return reply.status(409).send({ error: `订单不能从「${existing.status}」变更为「${parsed.data.status}」` });
      }
    }
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
    if (existing.status !== "draft") return reply.status(409).send({ error: "只有草稿订单可以删除，请改为取消订单" });
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

  app.get("/payments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const payment = getPayment(id);
    if (!payment) return reply.status(404).send({ error: "付款不存在" });
    if (!requireScope(request, reply, payment.enterpriseId)) return;
    return reply.send(payment);
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

  app.patch("/payments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getPayment(id);
    if (!existing) return reply.status(404).send({ error: "付款不存在" });
    if (!requireScope(request, reply, existing.enterpriseId)) return;
    const parsed = UpdatePaymentRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const changesRecord = parsed.data.amount !== undefined || parsed.data.method !== undefined || parsed.data.orderId !== undefined;
    if (changesRecord && existing.status !== "pending") {
      return reply.status(409).send({ error: "已入账付款不能修改金额、方式或关联订单" });
    }
    if (parsed.data.orderId) {
      const order = getOrder(parsed.data.orderId);
      if (!order || order.enterpriseId !== existing.enterpriseId) {
        return reply.status(400).send({ error: "关联订单不存在或不属于当前企业" });
      }
    }
    if (parsed.data.status && parsed.data.status !== existing.status) {
      const allowedTransitions: Record<string, string[]> = {
        pending: ["completed", "failed"], completed: ["refunded"], failed: ["pending"], refunded: [],
      };
      if (!allowedTransitions[existing.status]?.includes(parsed.data.status)) {
        return reply.status(409).send({ error: `付款不能从「${existing.status}」变更为「${parsed.data.status}」` });
      }
    }
    const payment = updatePayment(id, parsed.data);
    emitEvent("update", "payment", id, payment as unknown as Record<string, unknown>, "api");
    if (parsed.data.status && parsed.data.status !== existing.status) {
      emitEvent("status_change", "payment", id, payment as unknown as Record<string, unknown>, "api");
    }
    return reply.send(payment);
  });

  // ---- Invoices ----
  app.get("/invoices", async (request, reply) => {
    const { enterpriseId, status, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listInvoices(enterpriseId, { status, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  });

  app.get("/invoices/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = getInvoice(id);
    if (!invoice) return reply.status(404).send({ error: "发票不存在" });
    if (!requireScope(request, reply, invoice.enterpriseId)) return;
    return reply.send(invoice);
  });

  app.post("/invoices", async (request, reply) => {
    const parsed = CreateInvoiceRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    if (!canAccessEnterprise(request, parsed.data.enterpriseId, reply)) return;
    if (parsed.data.orderId) {
      const order = getOrder(parsed.data.orderId);
      if (!order || order.enterpriseId !== parsed.data.enterpriseId) return reply.status(400).send({ error: "关联订单不存在或不属于当前企业" });
    }
    if (parsed.data.customerId) {
      const customer = getCustomer(parsed.data.customerId);
      if (!customer || customer.enterpriseId !== parsed.data.enterpriseId) return reply.status(400).send({ error: "关联客户不存在或不属于当前企业" });
    }
    const invoice = createInvoice(parsed.data);
    emitEvent("create", "invoice", invoice.id, invoice as unknown as Record<string, unknown>, "api");
    return reply.status(201).send(invoice);
  });

  app.patch("/invoices/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getInvoice(id);
    if (!existing) return reply.status(404).send({ error: "发票不存在" });
    if (!requireScope(request, reply, existing.enterpriseId)) return;
    const parsed = UpdateInvoiceRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const nonStatusFields = Object.keys(parsed.data).filter((key) => key !== "status");
    if (existing.status !== "draft" && nonStatusFields.length > 0) {
      return reply.status(409).send({ error: "已开具发票只能更新业务状态，不能修改票面信息" });
    }
    if (parsed.data.orderId) {
      const order = getOrder(parsed.data.orderId);
      if (!order || order.enterpriseId !== existing.enterpriseId) return reply.status(400).send({ error: "关联订单不存在或不属于当前企业" });
    }
    if (parsed.data.customerId) {
      const customer = getCustomer(parsed.data.customerId);
      if (!customer || customer.enterpriseId !== existing.enterpriseId) return reply.status(400).send({ error: "关联客户不存在或不属于当前企业" });
    }
    if (parsed.data.status && parsed.data.status !== existing.status) {
      const allowedTransitions: Record<string, string[]> = {
        draft: ["issued", "cancelled"], issued: ["paid", "overdue", "cancelled"],
        overdue: ["paid", "cancelled"], paid: [], cancelled: [],
      };
      if (!allowedTransitions[existing.status]?.includes(parsed.data.status)) {
        return reply.status(409).send({ error: `发票不能从「${existing.status}」变更为「${parsed.data.status}」` });
      }
      if (parsed.data.status === "issued" && parsed.data.issuedAt === undefined) parsed.data.issuedAt = new Date().toISOString();
    }
    const invoice = updateInvoice(id, parsed.data);
    if (!invoice) return reply.status(404).send({ error: "发票不存在" });
    emitEvent("update", "invoice", id, invoice as unknown as Record<string, unknown>, "api");
    const nextStatus = parsed.data.status;
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
    if (existing.status !== "draft") return reply.status(409).send({ error: "只有草稿发票可以删除，已开具发票请执行作废" });
    const ok = deleteInvoice(id);
    if (!ok) return reply.status(404).send({ error: "发票不存在" });
    emitEvent("delete", "invoice", id, existing as unknown as Record<string, unknown>, "api");
    return reply.status(204).send();
  });
}
