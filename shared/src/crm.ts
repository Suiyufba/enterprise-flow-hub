import { z } from "zod";

export const EntityTagsSchema = z.array(z.string().trim().min(1).max(30)).max(20);
export const CustomerGenderSchema = z.enum(["unknown", "male", "female", "other"]);

function withUnitPriceAlias(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const input = raw as Record<string, unknown>;
  if (input.unitPrice === undefined && input.price !== undefined) {
    return { ...input, unitPrice: input.price };
  }
  return raw;
}

// ---- Customer ----
export const CustomerSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  name: z.string(),
  contact: z.string(),
  phone: z.string(),
  email: z.string(),
  address: z.string(),
  gender: CustomerGenderSchema,
  tags: EntityTagsSchema,
  status: z.enum(["active", "inactive", "lead", "lost"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateCustomerRequestSchema = z.object({
  enterpriseId: z.string(),
  name: z.string().min(1).max(120),
  contact: z.string().max(60).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(120).optional(),
  address: z.string().max(300).optional(),
  gender: CustomerGenderSchema.optional(),
  tags: EntityTagsSchema.optional(),
  status: z.enum(["active", "inactive", "lead", "lost"]).optional(),
});

export const UpdateCustomerRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  contact: z.string().max(60).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(120).optional(),
  address: z.string().max(300).optional(),
  gender: CustomerGenderSchema.optional(),
  tags: EntityTagsSchema.optional(),
  status: z.enum(["active", "inactive", "lead", "lost"]).optional(),
});

export type Customer = z.infer<typeof CustomerSchema>;
export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequestSchema>;
export type UpdateCustomerRequest = z.infer<typeof UpdateCustomerRequestSchema>;

// ---- Supplier ----
export const SupplierSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  name: z.string(),
  contact: z.string(),
  phone: z.string(),
  email: z.string(),
  address: z.string(),
  tags: EntityTagsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateSupplierRequestSchema = z.object({
  enterpriseId: z.string(),
  name: z.string().min(1).max(120),
  contact: z.string().max(60).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(120).optional(),
  address: z.string().max(300).optional(),
  tags: EntityTagsSchema.optional(),
});

export const UpdateSupplierRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  contact: z.string().max(60).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(120).optional(),
  address: z.string().max(300).optional(),
  tags: EntityTagsSchema.optional(),
});

export type Supplier = z.infer<typeof SupplierSchema>;
export type CreateSupplierRequest = z.infer<typeof CreateSupplierRequestSchema>;
export type UpdateSupplierRequest = z.infer<typeof UpdateSupplierRequestSchema>;

// ---- Product ----
export const ProductSchema = z.object({
  id: z.string(),
  enterpriseId: z.string(),
  name: z.string(),
  sku: z.string(),
  category: z.string(),
  unitPrice: z.number(),
  price: z.number().optional(),
  unit: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateProductRequestSchema = z.preprocess(withUnitPriceAlias, z.object({
  enterpriseId: z.string(),
  name: z.string().min(1).max(120),
  sku: z.string().max(60).optional(),
  category: z.string().max(60).optional(),
  unitPrice: z.number().min(0).optional(),
  unit: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
}));

export const UpdateProductRequestSchema = z.preprocess(withUnitPriceAlias, z.object({
  name: z.string().min(1).max(120).optional(),
  sku: z.string().max(60).optional(),
  category: z.string().max(60).optional(),
  unitPrice: z.number().min(0).optional(),
  unit: z.string().max(20).optional(),
  description: z.string().max(500).optional(),
}));

export type Product = z.infer<typeof ProductSchema>;
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

// Paginated list response
export interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
