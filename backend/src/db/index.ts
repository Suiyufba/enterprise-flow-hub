import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH ?? join(__dirname, "..", "..", "data", "efh.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dir = dirname(DB_PATH);
    mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
    db.exec(schema);
    db.exec(`
      CREATE TABLE IF NOT EXISTS plugin_configs (
        plugin_id   TEXT PRIMARY KEY REFERENCES plugins(id) ON DELETE CASCADE,
        config_json TEXT NOT NULL DEFAULT '{}',
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const automationColumns = db.prepare("PRAGMA table_info(automations)").all() as Array<{ name: string }>;
    if (!automationColumns.some((column) => column.name === "action_plugin_id")) {
      db.prepare("ALTER TABLE automations ADD COLUMN action_plugin_id TEXT").run();
    }

    const personaColumns = db.prepare("PRAGMA table_info(agent_personas)").all() as Array<{ name: string }>;
    if (!personaColumns.some((column) => column.name === "thinking_provider_id")) {
      db.prepare("ALTER TABLE agent_personas ADD COLUMN thinking_provider_id TEXT").run();
    }
    if (!personaColumns.some((column) => column.name === "memory")) {
      db.prepare("ALTER TABLE agent_personas ADD COLUMN memory TEXT DEFAULT ''").run();
    }

    // Ensure tool-create-automation exists (added after initial seed)
    const autoExisting = db.prepare("SELECT id FROM ai_tools WHERE id = 'tool-create-automation'").get();
    if (!autoExisting) {
      db.prepare(`INSERT INTO ai_tools (id, name, description, kind, status, risk, input_schema, example_prompt, created_at)
        VALUES ('tool-create-automation', '创建自动化规则', '在项目下创建一条自动化规则（定时任务、消息触发、通知推送等）。Agent 用它来将用户的自动化需求落地。',
        'cli', 'enabled', 'write', '{"projectId":"proj-xxx","name":"每日清理","trigger":"每天早上9:00","triggerType":"schedule","action":"删除重复电话号码","actionType":"call_ai"}',
        '帮我设置每天早上9点自动清理重复的电话号码', '2026-05-27T00:00:00.000Z')`).run();
    }

    // Ensure tool-create-library-item exists (added after initial seed)
    const existing = db.prepare("SELECT id FROM ai_tools WHERE id = 'tool-create-library-item'").get();
    if (!existing) {
      db.prepare(`INSERT INTO ai_tools (id, name, description, kind, status, risk, input_schema, example_prompt, created_at)
        VALUES ('tool-create-library-item', '创建业务资料', '在项目下创建一条业务资料记录（客户、订单、文档等）。Agent 应该用它来持久化用户的业务数据。',
        'cli', 'enabled', 'write', '{"enterpriseId":"ent-xxx","projectId":"proj-xxx","name":"客户名称","type":"note","summary":"客户详细信息","visibility":"public"}',
        '帮我记录一个新客户张三，联系方式是...', '2026-05-26T00:00:00.000Z')`).run();
    }

    // Seed baseline workspace data only if this is a fresh database.
    const count = db.prepare("SELECT COUNT(*) as cnt FROM enterprises").get() as { cnt: number };
    if (count.cnt === 0) {
      const seed = readFileSync(join(__dirname, "seed.sql"), "utf-8");
      db.exec(seed);
    }

    const toolCount = db.prepare("SELECT COUNT(*) as cnt FROM ai_tools").get() as { cnt: number };
    if (toolCount.cnt === 0) {
      const seed = readFileSync(join(__dirname, "seed.sql"), "utf-8");
      db.exec(seed);
    }

    const skillCount = db.prepare("SELECT COUNT(*) as cnt FROM agent_skills").get() as { cnt: number };
    const personaCount = db.prepare("SELECT COUNT(*) as cnt FROM agent_personas").get() as { cnt: number };
    const providerCount = db.prepare("SELECT COUNT(*) as cnt FROM model_providers").get() as { cnt: number };
    const userCount = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
    if (skillCount.cnt === 0 || personaCount.cnt === 0 || providerCount.cnt === 0 || userCount.cnt === 0) {
      const seed = readFileSync(join(__dirname, "seed.sql"), "utf-8");
      db.exec(seed);
    }
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
