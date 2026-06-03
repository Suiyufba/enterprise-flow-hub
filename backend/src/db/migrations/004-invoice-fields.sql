-- Migration: 发票字段补全 — 按中国增值税发票标准添加字段
ALTER TABLE invoices ADD COLUMN invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN invoice_code TEXT;
ALTER TABLE invoices ADD COLUMN invoice_type TEXT;
ALTER TABLE invoices ADD COLUMN tax_rate REAL;
ALTER TABLE invoices ADD COLUMN tax_amount REAL;
ALTER TABLE invoices ADD COLUMN total_amount REAL;
ALTER TABLE invoices ADD COLUMN buyer_name TEXT;
ALTER TABLE invoices ADD COLUMN buyer_tax_id TEXT;
ALTER TABLE invoices ADD COLUMN seller_name TEXT;
ALTER TABLE invoices ADD COLUMN seller_tax_id TEXT;
ALTER TABLE invoices ADD COLUMN remark TEXT;
ALTER TABLE invoices ADD COLUMN issuer TEXT;
