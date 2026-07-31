// E2E fixture setup: create a fresh seeded database and point the seeded
// model provider at the local stub LLM so the smoke tests need no external
// API keys. Run with DB_PATH set (see playwright.config.ts).
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const dbPath = process.env.DB_PATH;
if (!dbPath) throw new Error("DB_PATH is required");

rmSync(dbPath, { force: true });
mkdirSync(dirname(dbPath), { recursive: true });

const { getDb, closeDb } = await import("../src/db/index.js");
const db = getDb();
db.prepare(`
  UPDATE model_providers
  SET base_url = ?, model = ?, api_key_env = ?, enabled = 1
  WHERE id = 'provider-deepseek'
`).run(process.env.STUB_AI_URL ?? "http://127.0.0.1:4999", "stub-model", "stub-key");

const row = db.prepare("SELECT id, base_url, model FROM model_providers WHERE id = 'provider-deepseek'").get() as {
  id: string; base_url: string; model: string;
};
closeDb();
console.log(`[e2e-setup] DB ready at ${dbPath}; provider ${row.id} -> ${row.base_url} (${row.model})`);
