import Database from "better-sqlite3";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH ?? join(__dirname, "..", "..", "data", "efh.db");

let db: Database.Database | null = null;

const FINANCE_SKILLS = [
  {
    id: "skill-finance-pitch-builder",
    name: "Pitch Builder",
    description: "为融资、投研或客户汇报生成 Pitchbook、投资建议书和配套邮件。",
    toolIds: ["tool-mcp-company-context", "tool-create-library-item"],
    prompt: "你是投行 Pitchbook 助手。先明确客户/标的/交易目标，再输出 comps 思路、PPT 大纲、关键图表、客户邮件和风险提示。不要编造数据；缺少财务数据时列出需要补充的表格字段。",
    createdAt: "2026-05-29T00:00:00.000Z",
  },
  {
    id: "skill-finance-model-builder",
    name: "Model Builder",
    description: "搭建 DCF、三表联动、敏感性分析和蒙特卡洛估值模型。",
    toolIds: ["tool-csv-profile", "tool-mcp-company-context"],
    prompt: "你是金融模型搭建助手。根据输入的公司、财务表或假设，设计 DCF/三表联动/敏感性分析步骤，输出关键假设、公式结构、检查项和估值结论；所有数字必须说明来源或标记为假设。",
    createdAt: "2026-05-29T00:01:00.000Z",
  },
  {
    id: "skill-finance-earnings-reviewer",
    name: "Earnings Reviewer",
    description: "阅读财报、10-K/10-Q 和电话会纪要，提炼业绩变化与交易判断。",
    toolIds: ["tool-csv-profile", "tool-mcp-company-context"],
    prompt: "你是财报审阅员。先提取收入、利润率、现金流、指引和管理层语气变化，再判断业绩好坏、估值影响、是否加仓/减仓，并列出需要核验的财报页码或原文依据。",
    createdAt: "2026-05-29T00:02:00.000Z",
  },
  {
    id: "skill-finance-kyc-screener",
    name: "KYC Screener",
    description: "做客户背景调查、反洗钱初筛、制裁名单和交易风险梳理。",
    toolIds: ["tool-mcp-company-context", "tool-browser-check"],
    prompt: "你是 KYC/AML 初筛助手。围绕客户主体、实控人、业务关系、诉讼制裁、负面新闻和交易异常做检查，输出风险等级、证据、缺口资料和下一步尽调问题。",
    createdAt: "2026-05-29T00:03:00.000Z",
  },
  {
    id: "skill-finance-k-dense-scientific",
    name: "K-Dense Scientific",
    description: "对 Excel/CSV 金融数据做 ARIMA、GARCH、Monte Carlo、回测和相关性分析。",
    toolIds: ["tool-csv-profile", "tool-create-library-item"],
    prompt: "你是量化数据分析助手。先识别时间序列、收益率、缺失值和异常值，再给出 ARIMA/GARCH/Monte Carlo/相关性/回测方案，输出图表建议、指标解释、代码或公式草案和风险限制。",
    createdAt: "2026-05-29T00:04:00.000Z",
  },
  {
    id: "skill-finance-awesome-finance",
    name: "Awesome Finance",
    description: "聚合财经新闻、市场情绪、热点板块和预测信号，生成每日市场摘要。",
    toolIds: ["tool-browser-check", "tool-mcp-company-context"],
    prompt: "你是每日市场情绪分析助手。按新闻、社媒热度、预测市场、板块轮动和情绪得分组织信息，输出偏多/偏空判断、热点板块、风险事件和需要继续跟踪的数据源。",
    createdAt: "2026-05-29T00:05:00.000Z",
  },
  {
    id: "skill-finance-equity-research",
    name: "Equity Research",
    description: "生成个股投研框架、Bull/Base/Bear 情景、目标价和风险清单。",
    toolIds: ["tool-browser-check", "tool-mcp-company-context"],
    prompt: "你是股票研究员。围绕商业模式、财务表现、估值、催化剂、风险、内部人交易和 ESG 检查，输出 Bull/Base/Bear 三情景、12 个月目标价逻辑和可验证的数据清单。",
    createdAt: "2026-05-29T00:06:00.000Z",
  },
  {
    id: "skill-finance-office-skills",
    name: "Claude Office Skills",
    description: "把 Excel 明细、公式审计、三表联动和图表任务变成可执行办公流程。",
    toolIds: ["tool-csv-profile", "tool-create-library-item"],
    prompt: "你是 Excel/Office 办公自动化助手。优先处理 dcf、lbo、comps、三表联动、audit-xls、公式审计和模板刷新；输出清晰公式、表结构、异常检查和可复制步骤。",
    createdAt: "2026-05-29T00:07:00.000Z",
  },
  {
    id: "skill-finance-claude-excel-ppt",
    name: "Claude for Excel/PPT",
    description: "在 Excel/PPT/Word 场景里做数据联动、图表更新、讲稿和改稿。",
    toolIds: ["tool-csv-profile", "tool-create-library-item"],
    prompt: "你是 Excel/PPT/Word 协作助手。把数据表转换成透视分析、图表、PPT 页面结构和讲稿；每次输出都包含可粘贴的表格字段、页面标题、图表类型和修改建议。",
    createdAt: "2026-05-29T00:08:00.000Z",
  },
  {
    id: "skill-finance-openclaw",
    name: "OpenClaw 一人量化",
    description: "搭建常驻量化研究 Agent：自动抓数据、滚动回测、风险监控和信号推送。",
    toolIds: ["tool-mcp-company-context", "tool-browser-check", "tool-create-automation"],
    prompt: "你是 24 小时量化研究 Agent。为用户设计数据抓取、策略迭代、滚动回测、异常推送和风险监控流程；输出可自动化的任务、触发器、指标阈值和验证方法。",
    createdAt: "2026-05-29T00:09:00.000Z",
  },
] as const;

function ensureFinanceSkills(database: Database.Database) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO agent_skills (id, name, description, tool_ids, prompt, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);
  const tx = database.transaction(() => {
    for (const skill of FINANCE_SKILLS) {
      insert.run(skill.id, skill.name, skill.description, JSON.stringify(skill.toolIds), skill.prompt, skill.createdAt);
    }
  });
  tx();
}

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

    // Departments & enterprise org chart
    db.exec(`
      CREATE TABLE IF NOT EXISTS departments (
        id            TEXT PRIMARY KEY,
        enterprise_id TEXT NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
        parent_id     TEXT REFERENCES departments(id) ON DELETE SET NULL,
        name          TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const userCols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    if (!userCols.some((c) => c.name === "department_id")) {
      db.prepare("ALTER TABLE users ADD COLUMN department_id TEXT REFERENCES departments(id) ON DELETE SET NULL").run();
    }
    if (!userCols.some((c) => c.name === "position")) {
      db.prepare("ALTER TABLE users ADD COLUMN position TEXT DEFAULT ''").run();
    }

    // ---- File-based migration system (Phase 0+) ----
    db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const applied = new Set(
      (db.prepare("SELECT id FROM _migrations").all() as Array<{ id: string }>).map((r) => r.id),
    );
    const migrationDir = join(__dirname, "migrations");
    let migrationFiles: string[] = [];
    try {
      migrationFiles = readdirSync(migrationDir).filter((f) => f.endsWith(".sql")).sort();
    } catch {
      // migrations directory might not exist yet
    }
    const applyMigration = (file: string) => {
      if (applied.has(file)) return;
      const sql = readFileSync(join(migrationDir, file), "utf-8");
      db!.exec(sql);
      db!.prepare("INSERT INTO _migrations (id) VALUES (?)").run(file);
      applied.add(file);
    };
    const freshDatabase = (db.prepare("SELECT COUNT(*) as cnt FROM enterprises").get() as { cnt: number }).cnt === 0;
    const deferredFreshMigrations = new Set([
      "003-business-demo-data.sql",
      "008-operational-agent.sql",
      "009-operational-defaults.sql",
      "010-customer-duplicate-audit.sql",
      "011-agent-customer-value.sql",
      "012-entity-tags-and-gender.sql",
      "013-project-business-scope.sql",
      "014-repair-legacy-project-attribution.sql",
      "015-agent-customer-profile-update.sql",
    ]);

    // A fresh database needs CRM/order tables before seed.sql, while data and
    // Agent migrations must run after seed.sql so they can update seeded rows.
    for (const file of migrationFiles) {
      if (freshDatabase && deferredFreshMigrations.has(file)) continue;
      applyMigration(file);
    }
    if (freshDatabase) {
      const seed = readFileSync(join(__dirname, "seed.sql"), "utf-8");
      db.exec(seed);
      for (const file of migrationFiles) {
        if (deferredFreshMigrations.has(file)) applyMigration(file);
      }
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

    // Repair partially initialized databases without overwriting user data.
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

    ensureFinanceSkills(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
