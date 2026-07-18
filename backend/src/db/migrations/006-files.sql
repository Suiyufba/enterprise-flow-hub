-- Phase 7: File Management

CREATE TABLE IF NOT EXISTS files (
  id              TEXT PRIMARY KEY,
  enterprise_id   TEXT NOT NULL,
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size            INTEGER NOT NULL DEFAULT 0,
  storage_path    TEXT NOT NULL,
  uploaded_by     TEXT,
  related_type    TEXT,
  related_id      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_files_enterprise ON files(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_files_related    ON files(related_type, related_id);
