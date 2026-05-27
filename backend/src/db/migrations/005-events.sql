-- Phase 6: Event Center

CREATE TABLE IF NOT EXISTS business_events (
  id            TEXT PRIMARY KEY,
  event_type    TEXT NOT NULL,
  object_type   TEXT,
  object_id     TEXT,
  payload       TEXT NOT NULL DEFAULT '{}',
  source        TEXT NOT NULL DEFAULT 'system',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  processed     INTEGER NOT NULL DEFAULT 0 CHECK (processed IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_events_type      ON business_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_processed ON business_events(processed, created_at);
CREATE INDEX IF NOT EXISTS idx_events_object    ON business_events(object_type, object_id);
