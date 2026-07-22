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
  listInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice, findInvoiceByIdentity,
} from "../store/orders.js";
import { getFileInternal } from "../store/files.js";
import { getCustomer, getProduct } from "../store/crm.js";
import { canAccessEnterprise } from "./auth-context.js";
import { emitEvent } from "../events/emitter.js";
import { projectBelongsToEnterprise } from "../project-scope.js";

function requireScope(request: FastifyRequest, reply: FastifyReply, recordEid: string): boolean {
  return canAccessEnterprise(request, recordEid, reply);
}

export async function ordersRoutes(app: FastifyInstance): Promise<void> {
  // ---- Orders ----
  app.get("/orders", async (request, reply) => {
    const { enterpriseId, projectId, status, customerId, search, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listOrders(enterpriseId, { projectId, status, customerId, search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
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
    let projectId = parsed.data.projectId;
    if (parsed.data.customerId) {
      const customer = getCustomer(parsed.data.customerId);
      if (!customer || customer.enterpriseId !== parsed.data.enterpriseId) {
        return reply.status(400).send({ error: "关联客户不存在或不属于当前企业" });
      }
      projectId ??= customer.projectId;
      if (customer.projectId !== projectId) return reply.status(400).send({ error: "客户与订单必须属于同一个项目" });
    }
    for (const item of parsed.data.items) {
      if (!item.productId) continue;
      const product = getProduct(item.productId);
      if (!product || product.enterpriseId !== parsed.data.enterpriseId) {
        return reply.status(400).send({ error: "订单商品不存在或不属于当前企业" });
      }
      projectId ??= product.projectId;
      if (product.projectId !== projectId) return reply.status(400).send({ error: "商品与订单必须属于同一个项目" });
    }
    if (projectId && !projectBelongsToEnterprise(projectId, parsed.data.enterpriseId)) {
      return reply.status(400).send({ error: "项目不存在或不属于当前企业" });
    }
    let order;
    try { order = createOrder({ ...parsed.data, projectId }); }
    catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : "创建订单失败" }); }
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
    if (parsed.data.projectId) {
      if (!projectBelongsToEnterprise(parsed.data.projectId, existing.enterpriseId)) {
        return reply.status(400).send({ error: "项目不存在或不属于当前企业" });
      }
      const customer = existing.customerId ? getCustomer(existing.customerId) : undefined;
      if (customer && customer.projectId !== parsed.data.projectId) {
        return reply.status(400).send({ error: "请先将关联客户移到目标项目，再移动订单" });
      }
      for (const item of existing.items) {
        const product = item.productId ? getProduct(item.productId) : undefined;
        if (product && product.projectId !== parsed.data.projectId) {
          return reply.status(400).send({ error: "订单包含其他项目的商品，暂不能移动" });
        }
      }
    }
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
    const { enterpriseId, projectId, orderId, status, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listPayments(enterpriseId, { projectId, orderId, status, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
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
    let projectId = parsed.data.projectId;
    if (parsed.data.orderId) {
      const order = getOrder(parsed.data.orderId);
      if (!order) {
        return reply.status(400).send({ error: "关联订单不存在", orderId: parsed.data.orderId });
      }
      if (order.enterpriseId !== parsed.data.enterpriseId) {
        return reply.status(403).send({ error: "不能为其他企业订单创建付款" });
      }
      projectId ??= order.projectId;
      if (order.projectId !== projectId) return reply.status(400).send({ error: "付款与订单必须属于同一个项目" });
    }
    if (projectId && !projectBelongsToEnterprise(projectId, parsed.data.enterpriseId)) {
      return reply.status(400).send({ error: "项目不存在或不属于当前企业" });
    }
    let payment;
    try { payment = createPayment({ ...parsed.data, projectId }); }
    catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : "创建付款失败" }); }
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
    const targetProjectId = parsed.data.projectId ?? existing.projectId;
    if (!projectBelongsToEnterprise(targetProjectId, existing.enterpriseId)) {
      return reply.status(400).send({ error: "项目不存在或不属于当前企业" });
    }
    const changesRecord = parsed.data.amount !== undefined || parsed.data.method !== undefined || parsed.data.orderId !== undefined;
    if (changesRecord && existing.status !== "pending") {
      return reply.status(409).send({ error: "已入账付款不能修改金额、方式或关联订单" });
    }
    if (parsed.data.orderId) {
      const order = getOrder(parsed.data.orderId);
      if (!order || order.enterpriseId !== existing.enterpriseId) {
        return reply.status(400).send({ error: "关联订单不存在或不属于当前企业" });
      }
      if (order.projectId !== targetProjectId) return reply.status(400).send({ error: "付款与订单必须属于同一个项目" });
    } else if (existing.orderId) {
      const order = getOrder(existing.orderId);
      if (order && order.projectId !== targetProjectId) return reply.status(400).send({ error: "请先解除关联订单，再移动付款" });
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
    const { enterpriseId, projectId, status, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listInvoices(enterpriseId, { projectId, status, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
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
    let projectId = parsed.data.projectId;
    if (parsed.data.orderId) {
      const order = getOrder(parsed.data.orderId);
      if (!order || order.enterpriseId !== parsed.data.enterpriseId) return reply.status(400).send({ error: "关联订单不存在或不属于当前企业" });
      projectId ??= order.projectId;
      if (order.projectId !== projectId) return reply.status(400).send({ error: "发票与订单必须属于同一个项目" });
    }
    if (parsed.data.customerId) {
      const customer = getCustomer(parsed.data.customerId);
      if (!customer || customer.enterpriseId !== parsed.data.enterpriseId) return reply.status(400).send({ error: "关联客户不存在或不属于当前企业" });
      projectId ??= customer.projectId;
      if (customer.projectId !== projectId) return reply.status(400).send({ error: "发票与客户必须属于同一个项目" });
    }
    if (parsed.data.sourceFileId) {
      const sourceFile = getFileInternal(parsed.data.sourceFileId);
      if (!sourceFile || sourceFile.enterpriseId !== parsed.data.enterpriseId) {
        return reply.status(400).send({ error: "OCR 来源文件不存在或不属于当前企业" });
      }
      projectId ??= sourceFile.projectId;
      if (sourceFile.projectId !== projectId) return reply.status(400).send({ error: "发票与 OCR 来源文件必须属于同一个项目" });
    }
    if (projectId && !projectBelongsToEnterprise(projectId, parsed.data.enterpriseId)) {
      return reply.status(400).send({ error: "项目不存在或不属于当前企业" });
    }
    if (parsed.data.invoiceNumber) {
      const duplicate = findInvoiceByIdentity(parsed.data.enterpriseId, parsed.data.invoiceNumber, parsed.data.invoiceCode);
      if (duplicate) return reply.status(409).send({ error: `发票已存在：${duplicate.id}` });
    }
    let invoice;
    try { invoice = createInvoice({ ...parsed.data, projectId }); }
    catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : "创建发票失败" }); }
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
    const targetProjectId = parsed.data.projectId ?? existing.projectId;
    if (!projectBelongsToEnterprise(targetProjectId, existing.enterpriseId)) {
      return reply.status(400).send({ error: "项目不存在或不属于当前企业" });
    }
    const nonStatusFields = Object.keys(parsed.data).filter((key) => key !== "status");
    if (existing.status !== "draft" && nonStatusFields.length > 0) {
      return reply.status(409).send({ error: "已开具发票只能更新业务状态，不能修改票面信息" });
    }
    if (parsed.data.orderId) {
      const order = getOrder(parsed.data.orderId);
      if (!order || order.enterpriseId !== existing.enterpriseId) return reply.status(400).send({ error: "关联订单不存在或不属于当前企业" });
      if (order.projectId !== targetProjectId) return reply.status(400).send({ error: "发票与订单必须属于同一个项目" });
    } else if (existing.orderId) {
      const order = getOrder(existing.orderId);
      if (order && order.projectId !== targetProjectId) return reply.status(400).send({ error: "请先解除关联订单，再移动发票" });
    }
    if (parsed.data.customerId) {
      const customer = getCustomer(parsed.data.customerId);
      if (!customer || customer.enterpriseId !== existing.enterpriseId) return reply.status(400).send({ error: "关联客户不存在或不属于当前企业" });
      if (customer.projectId !== targetProjectId) return reply.status(400).send({ error: "发票与客户必须属于同一个项目" });
    } else if (existing.customerId) {
      const customer = getCustomer(existing.customerId);
      if (customer && customer.projectId !== targetProjectId) return reply.status(400).send({ error: "请先解除关联客户，再移动发票" });
    }
    if (parsed.data.sourceFileId) {
      const sourceFile = getFileInternal(parsed.data.sourceFileId);
      if (!sourceFile || sourceFile.enterpriseId !== existing.enterpriseId || sourceFile.projectId !== targetProjectId) {
        return reply.status(400).send({ error: "OCR 来源文件不存在或不属于当前项目" });
      }
    }
    const nextInvoiceNumber = parsed.data.invoiceNumber === undefined ? existing.invoiceNumber : parsed.data.invoiceNumber;
    const nextInvoiceCode = parsed.data.invoiceCode === undefined ? existing.invoiceCode : parsed.data.invoiceCode;
    if (nextInvoiceNumber) {
      const duplicate = findInvoiceByIdentity(existing.enterpriseId, nextInvoiceNumber, nextInvoiceCode ?? undefined);
      if (duplicate && duplicate.id !== existing.id) return reply.status(409).send({ error: `发票已存在：${duplicate.id}` });
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
