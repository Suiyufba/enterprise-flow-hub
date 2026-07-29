-- Durable scheduling and event delivery for multi-process deployments.
--
-- SQLite serializes writers. Claims below are therefore coordinated through
-- short IMMEDIATE transactions and expiring leases instead of process memory.

CREATE TABLE IF NOT EXISTS automation_jobs (
  id               TEXT PRIMARY KEY,
  automation_id    TEXT NOT NULL,
  trigger_source   TEXT NOT NULL,
  trigger_event    TEXT NOT NULL DEFAULT '{}',
  dedupe_key       TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','success','failed','dead')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 3,
  available_at     TEXT NOT NULL,
  lease_owner      TEXT,
  lease_expires_at TEXT,
  output           TEXT NOT NULL DEFAULT '',
  error_message    TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  started_at       TEXT,
  completed_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_automation_jobs_claim
  ON automation_jobs(status, available_at, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_automation
  ON automation_jobs(automation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS automation_leases (
  automation_id    TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL,
  acquired_at      TEXT NOT NULL,
  heartbeat_at     TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_automation_leases_expiry
  ON automation_leases(lease_expires_at);

CREATE TABLE IF NOT EXISTS maintenance_runs (
  task_name        TEXT NOT NULL,
  schedule_slot    TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','success','failed','dead')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 3,
  available_at     TEXT NOT NULL,
  lease_owner      TEXT,
  lease_expires_at TEXT,
  error_message    TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  completed_at     TEXT,
  PRIMARY KEY (task_name, schedule_slot)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_runs_claim
  ON maintenance_runs(status, available_at, lease_expires_at);

ALTER TABLE business_events ADD COLUMN dispatch_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (dispatch_status IN ('pending','processing','success','failed','dead'));
ALTER TABLE business_events ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE business_events ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 5;
ALTER TABLE business_events ADD COLUMN available_at TEXT;
ALTER TABLE business_events ADD COLUMN lease_owner TEXT;
ALTER TABLE business_events ADD COLUMN lease_expires_at TEXT;
ALTER TABLE business_events ADD COLUMN last_error TEXT NOT NULL DEFAULT '';
ALTER TABLE business_events ADD COLUMN processed_at TEXT;

UPDATE business_events
SET dispatch_status = CASE WHEN processed = 1 THEN 'success' ELSE 'pending' END,
    available_at = COALESCE(available_at, created_at),
    processed_at = CASE WHEN processed = 1 THEN COALESCE(processed_at, created_at) ELSE processed_at END;

CREATE INDEX IF NOT EXISTS idx_business_events_dispatch
  ON business_events(processed, dispatch_status, available_at, lease_expires_at);

CREATE TABLE IF NOT EXISTS business_event_deliveries (
  event_id         TEXT NOT NULL,
  handler_key      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','success','failed','dead')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 5,
  available_at     TEXT NOT NULL,
  lease_owner      TEXT,
  lease_expires_at TEXT,
  last_error       TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  completed_at     TEXT,
  PRIMARY KEY (event_id, handler_key)
);

CREATE INDEX IF NOT EXISTS idx_event_deliveries_claim
  ON business_event_deliveries(status, available_at, lease_expires_at);

CREATE TABLE IF NOT EXISTS rule_event_runs (
  event_id      TEXT NOT NULL,
  rule_id       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','success','failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  completed_at  TEXT,
  PRIMARY KEY (event_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_rule_event_runs_status
  ON rule_event_runs(status, updated_at);

ALTER TABLE integration_runs ADD COLUMN lease_owner TEXT;
ALTER TABLE integration_runs ADD COLUMN lease_expires_at TEXT;
ALTER TABLE integration_runs ADD COLUMN heartbeat_at TEXT;
CREATE INDEX IF NOT EXISTS idx_int_lease ON integration_runs(status, lease_expires_at);
