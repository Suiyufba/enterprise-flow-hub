import { z } from "zod";

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

export const OrderItemCreateSchema = z.object({
  productId: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

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

export const CreatePaymentRequestSchema = z.object({
  enterpriseId: z.string(),
  orderId: z.string().optional(),
  amount: z.number().positive(),
  method: z.enum(["cash","bank_transfer","alipay","wechat","credit_card","other"]).optional(),
});

export type Payment = z.infer<typeof PaymentSchema>;
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;

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

export type Invoice = z.infer<typeof InvoiceSchema>;
export type CreateInvoiceRequest = z.infer<typeof CreateInvoiceRequestSchema>;
