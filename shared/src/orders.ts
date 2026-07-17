import { z } from "zod";

function withUnitPriceAlias(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const item = raw as Record<string, unknown>;
  if (item.unitPrice === undefined && item.price !== undefined) {
    return { ...item, unitPrice: item.price };
  }
  return raw;
}

function normalizeNullableOrderId(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const input = raw as Record<string, unknown>;
  if (input.orderId === null || input.orderId === "") {
    const { orderId: _orderId, ...rest } = input;
    return rest;
  }
  return raw;
}

// ---- Order ----
export const OrderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  productId: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  subtotal: z.number(),
});

export const OrderSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  customerId: z.string().nullable(),
  status: z.enum(["draft","confirmed","processing","shipped","delivered","cancelled","refunded"]),
  totalAmount: z.number(),
  notes: z.string(),
  items: z.array(OrderItemSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const OrderItemCreateSchema = z.preprocess(withUnitPriceAlias, z.object({
  productId: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
}));

export const CreateOrderRequestSchema = z.object({
  enterpriseId: z.string(),
  customerId: z.string().optional(),
  items: z.array(OrderItemCreateSchema).min(1),
  notes: z.string().max(500).optional(),
});

export const UpdateOrderRequestSchema = z.object({
  status: z.enum(["draft","confirmed","processing","shipped","delivered","cancelled","refunded"]).optional(),
  notes: z.string().max(500).optional(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export type UpdateOrderRequest = z.infer<typeof UpdateOrderRequestSchema>;

// ---- Payment ----
export const PaymentSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  orderId: z.string().nullable(),
  amount: z.number(),
  method: z.enum(["cash","bank_transfer","alipay","wechat","credit_card","other"]),
  status: z.enum(["pending","completed","failed","refunded"]),
  receivedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const CreatePaymentRequestSchema = z.preprocess(normalizeNullableOrderId, z.object({
  enterpriseId: z.string(),
  orderId: z.string().optional(),
  amount: z.number().positive(),
  method: z.enum(["cash","bank_transfer","alipay","wechat","credit_card","other"]).optional(),
}));

export const UpdatePaymentRequestSchema = z.object({
  orderId: z.string().nullable().optional(),
  amount: z.number().positive().optional(),
  method: z.enum(["cash","bank_transfer","alipay","wechat","credit_card","other"]).optional(),
  status: z.enum(["pending","completed","failed","refunded"]).optional(),
});

export type Payment = z.infer<typeof PaymentSchema>;
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;
export type UpdatePaymentRequest = z.infer<typeof UpdatePaymentRequestSchema>;

// ---- Invoice ----
export const InvoiceSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  orderId: z.string().nullable(),
  customerId: z.string().nullable(),
  amount: z.number(),
  status: z.enum(["draft","issued","paid","overdue","cancelled"]),
  dueDate: z.string().nullable(),
  issuedAt: z.string().nullable(),
  createdAt: z.string(),
  invoiceNumber: z.string().nullable(),
  invoiceCode: z.string().nullable(),
  invoiceType: z.enum(["vat_special","vat_normal","electronic"]).nullable(),
  taxRate: z.number().nullable(),
  taxAmount: z.number().nullable(),
  totalAmount: z.number().nullable(),
  buyerName: z.string().nullable(),
  buyerTaxId: z.string().nullable(),
  sellerName: z.string().nullable(),
  sellerTaxId: z.string().nullable(),
  remark: z.string().nullable(),
  issuer: z.string().nullable(),
});

export const CreateInvoiceRequestSchema = z.object({
  enterpriseId: z.string(),
  orderId: z.string().optional(),
  customerId: z.string().optional(),
  amount: z.number().positive(),
  dueDate: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceCode: z.string().optional(),
  invoiceType: z.enum(["vat_special","vat_normal","electronic"]).optional(),
  taxRate: z.number().optional(),
  taxAmount: z.number().optional(),
  totalAmount: z.number().optional(),
  buyerName: z.string().optional(),
  buyerTaxId: z.string().optional(),
  sellerName: z.string().optional(),
  sellerTaxId: z.string().optional(),
  remark: z.string().optional(),
  issuer: z.string().optional(),
});

export const UpdateInvoiceRequestSchema = CreateInvoiceRequestSchema
  .omit({ enterpriseId: true })
  .partial()
  .extend({
    orderId: z.string().nullable().optional(),
    customerId: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    invoiceNumber: z.string().nullable().optional(),
    invoiceCode: z.string().nullable().optional(),
    invoiceType: z.enum(["vat_special","vat_normal","electronic"]).nullable().optional(),
    taxRate: z.number().nullable().optional(),
    taxAmount: z.number().nullable().optional(),
    totalAmount: z.number().nullable().optional(),
    buyerName: z.string().nullable().optional(),
    buyerTaxId: z.string().nullable().optional(),
    sellerName: z.string().nullable().optional(),
    sellerTaxId: z.string().nullable().optional(),
    remark: z.string().nullable().optional(),
    issuer: z.string().nullable().optional(),
    issuedAt: z.string().nullable().optional(),
    status: z.enum(["draft","issued","paid","overdue","cancelled"]).optional(),
  });

export type Invoice = z.infer<typeof InvoiceSchema>;
export type CreateInvoiceRequest = z.infer<typeof CreateInvoiceRequestSchema>;
export type UpdateInvoiceRequest = z.infer<typeof UpdateInvoiceRequestSchema>;
