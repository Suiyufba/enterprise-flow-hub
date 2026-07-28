CREATE TABLE IF NOT EXISTS agent_model_configs (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  thinking_provider_id  TEXT NOT NULL,
  executor_provider_id  TEXT NOT NULL,
  embedding_provider_id TEXT NOT NULL,
  active                INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_model_configs_active
  ON agent_model_configs(active);
