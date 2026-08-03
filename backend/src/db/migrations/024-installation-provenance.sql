CREATE TABLE IF NOT EXISTS installation_provenance (
  id              TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  fingerprint     TEXT NOT NULL,
  license_id      TEXT,
  license_state   TEXT NOT NULL,
  first_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
