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
