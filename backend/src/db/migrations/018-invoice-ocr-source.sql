-- Link an OCR-created invoice to its original uploaded image.
ALTER TABLE invoices ADD COLUMN source_file_id TEXT;
CREATE INDEX IF NOT EXISTS idx_invoices_source_file ON invoices(source_file_id);
