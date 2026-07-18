-- Phase 5: Tasks & Approvals

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,
  enterprise_id   TEXT NOT NULL,
  assignee_id     TEXT,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','in_progress','completed','cancelled')),
  priority        TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high','urgent')),
  due_date        TEXT,
  source_type     TEXT,
  source_id       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approvals (
  id              TEXT PRIMARY KEY,
  enterprise_id   TEXT NOT NULL,
  requestor_id    TEXT,
  approver_id     TEXT,
  object_type     TEXT NOT NULL,
  object_id       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','cancelled')),
  comment         TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_enterprise    ON tasks(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee      ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status        ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_approvals_enterprise ON approvals(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_approvals_object     ON approvals(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver   ON approvals(approver_id);
