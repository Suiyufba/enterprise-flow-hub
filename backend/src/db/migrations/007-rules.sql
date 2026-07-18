-- Phase 8: Rules Engine

CREATE TABLE IF NOT EXISTS rules (
  id              TEXT PRIMARY KEY,
  enterprise_id   TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  object_type     TEXT NOT NULL,
  trigger_event   TEXT NOT NULL,
  condition_expr  TEXT NOT NULL DEFAULT '{}',
  action_type     TEXT NOT NULL
                  CHECK (action_type IN ('notify','set_field','create_task','trigger_approval','trigger_automation')),
  action_config   TEXT NOT NULL DEFAULT '{}',
  enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rules_enterprise    ON rules(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_rules_object_type   ON rules(object_type);
CREATE INDEX IF NOT EXISTS idx_rules_enabled       ON rules(enabled);

-- Phase 9: Auth & Audit

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  expires_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id              TEXT PRIMARY KEY,
  enterprise_id   TEXT NOT NULL,
  user_id         TEXT,
  action          TEXT NOT NULL,
  object_type     TEXT NOT NULL,
  object_id       TEXT,
  changes         TEXT NOT NULL DEFAULT '{}',
  ip_address      TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_token     ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires   ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_enterprise   ON audit_logs(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_audit_object       ON audit_logs(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_audit_user         ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_time         ON audit_logs(created_at);

-- Phase 10: Integration Reliability

CREATE TABLE IF NOT EXISTS integration_runs (
  id                TEXT PRIMARY KEY,
  integration_type  TEXT NOT NULL,
  object_type       TEXT,
  object_id         TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','success','failed','cancelled')),
  request_payload   TEXT NOT NULL DEFAULT '{}',
  response_payload  TEXT NOT NULL DEFAULT '',
  error_message     TEXT NOT NULL DEFAULT '',
  retry_count       INTEGER NOT NULL DEFAULT 0,
  max_retries       INTEGER NOT NULL DEFAULT 3,
  next_retry_at     TEXT,
  idempotency_key   TEXT UNIQUE,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_int_status    ON integration_runs(status);
CREATE INDEX IF NOT EXISTS idx_int_retry     ON integration_runs(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_int_idempotent ON integration_runs(idempotency_key);
