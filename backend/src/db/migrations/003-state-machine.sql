-- Phase 4: Process State Machine

CREATE TABLE IF NOT EXISTS business_object_statuses (
  id              TEXT PRIMARY KEY,
  object_type     TEXT NOT NULL,
  object_id       TEXT NOT NULL,
  status          TEXT NOT NULL,
  previous_status TEXT,
  changed_by      TEXT,
  changed_at      TEXT NOT NULL DEFAULT (datetime('now')),
  comment         TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_bos_object ON business_object_statuses(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_bos_time   ON business_object_statuses(changed_at);
