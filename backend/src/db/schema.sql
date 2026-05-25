-- Enterprise Flow Hub Database Schema (SQLite)

CREATE TABLE IF NOT EXISTS enterprises (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_enterprise ON users(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_users_username  ON users(username);

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  tags          TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS library_items (
  id            TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('screenshot', 'spreadsheet', 'document', 'note')),
  summary       TEXT NOT NULL,
  visibility    TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plugins (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS automations (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  trigger_desc  TEXT NOT NULL,
  trigger_type  TEXT NOT NULL CHECK (trigger_type IN ('schedule','message','webhook','email','file','manual')),
  action_desc   TEXT NOT NULL,
  action_type   TEXT NOT NULL CHECK (action_type IN ('send_email','call_ai','shell','api_call','notify','browser')),
  agent_model   TEXT,
  system_prompt TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  run_count     INTEGER NOT NULL DEFAULT 0,
  last_run      TEXT
);

CREATE TABLE IF NOT EXISTS ai_tools (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  kind           TEXT NOT NULL CHECK (kind IN ('mcp','cli','http','browser')),
  status         TEXT NOT NULL DEFAULT 'needs_config' CHECK (status IN ('enabled','needs_config','disabled')),
  risk           TEXT NOT NULL DEFAULT 'read_only' CHECK (risk IN ('read_only','write','admin')),
  input_schema   TEXT NOT NULL DEFAULT '{}',
  example_prompt TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tool_runs (
  id         TEXT PRIMARY KEY,
  tool_id    TEXT NOT NULL REFERENCES ai_tools(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('success','error')),
  input      TEXT NOT NULL DEFAULT '{}',
  output     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_skills (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tool_ids    TEXT NOT NULL DEFAULT '[]',
  prompt      TEXT NOT NULL DEFAULT '',
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_personas (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  role              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  system_prompt     TEXT NOT NULL DEFAULT '',
  default_skill_ids TEXT NOT NULL DEFAULT '[]',
  provider_id       TEXT NOT NULL DEFAULT 'provider-deepseek',
  enabled           INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS model_providers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  base_url        TEXT NOT NULL,
  model           TEXT NOT NULL,
  api_key_env     TEXT NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id                  TEXT PRIMARY KEY,
  summary             TEXT NOT NULL,
  screenshot_types    TEXT NOT NULL DEFAULT '[]',
  business_objects    TEXT NOT NULL DEFAULT '[]',
  fields              TEXT NOT NULL DEFAULT '[]',
  workflow_stages     TEXT NOT NULL DEFAULT '[]',
  problems            TEXT NOT NULL DEFAULT '[]',
  automation_rules    TEXT NOT NULL DEFAULT '[]',
  dashboard_metrics   TEXT NOT NULL DEFAULT '[]',
  implementation_plan TEXT NOT NULL DEFAULT '[]',
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_enterprise      ON projects(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_conversations_project     ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_enterprise  ON conversations(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation     ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_library_items_project     ON library_items(project_id);
CREATE INDEX IF NOT EXISTS idx_library_items_enterprise  ON library_items(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_automations_project       ON automations(project_id);
CREATE INDEX IF NOT EXISTS idx_tool_runs_tool            ON tool_runs(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_runs_created         ON tool_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_skills_enabled      ON agent_skills(enabled);
