-- Operational Agent: truthful automation runs, authenticated webhooks and real business tools.

ALTER TABLE automations RENAME TO automations_legacy;

CREATE TABLE automations (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL,
  name             TEXT NOT NULL,
  trigger_desc     TEXT NOT NULL,
  trigger_type     TEXT NOT NULL CHECK (trigger_type IN ('schedule','message','webhook','email','file','manual')),
  action_desc      TEXT NOT NULL,
  action_type      TEXT NOT NULL CHECK (action_type IN ('send_email','call_ai','shell','api_call','notify','browser','tool_call')),
  agent_model      TEXT,
  action_plugin_id TEXT,
  action_tool_id   TEXT,
  action_input     TEXT NOT NULL DEFAULT '{}',
  system_prompt    TEXT,
  webhook_secret   TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  run_count        INTEGER NOT NULL DEFAULT 0,
  last_run         TEXT,
  last_status      TEXT CHECK (last_status IN ('success','error')),
  last_output      TEXT,
  last_error       TEXT,
  last_duration_ms INTEGER
);

INSERT INTO automations (
  id, project_id, name, trigger_desc, trigger_type, action_desc, action_type,
  agent_model, action_plugin_id, system_prompt, enabled, run_count, last_run
)
SELECT
  id, project_id, name, trigger_desc, trigger_type, action_desc, action_type,
  agent_model, action_plugin_id, system_prompt, enabled, run_count, last_run
FROM automations_legacy;

DROP TABLE automations_legacy;
CREATE INDEX idx_automations_project ON automations(project_id);

CREATE TABLE IF NOT EXISTS automation_runs (
  id            TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('success','error')),
  trigger_event TEXT NOT NULL DEFAULT '{}',
  output        TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id, created_at DESC);

UPDATE automations
SET webhook_secret = lower(hex(randomblob(24)))
WHERE trigger_type = 'webhook' AND (webhook_secret IS NULL OR webhook_secret = '');

-- Existing free-text jobs that claimed to mutate data are converted to a real tool call.
UPDATE automations
SET action_type = 'tool_call',
    action_tool_id = 'tool-business-action',
    action_input = '{"operation":"deduplicate_customers_by_phone"}',
    action_desc = '合并同企业内电话号码相同的重复客户，并迁移关联订单和发票'
WHERE id = 'auto-fb2882fd-9b64-4677-8ba8-14f31077da66';

-- Unsupported demo workflows must not report themselves as running.
UPDATE automations SET enabled = 0 WHERE action_type IN ('send_email','shell','api_call','browser');
UPDATE automations SET enabled = 0 WHERE action_type = 'notify' AND action_plugin_id IS NULL;

UPDATE ai_tools
SET name = '项目上下文 MCP',
    description = '读取当前企业与项目的资料库、自动化、最近对话和业务摘要。企业与项目范围由 Agent 会话自动注入。',
    input_schema = '{"query":"线索阶段定义"}',
    status = 'enabled'
WHERE id = 'tool-mcp-company-context';

UPDATE ai_tools
SET name = '网页可用性巡检',
    description = '对公开 HTTP/HTTPS 页面执行状态码、标题和关键文本检查，并阻止访问本机或私网地址。',
    input_schema = '{"url":"https://example.com","checks":["登录"]}',
    status = 'enabled'
WHERE id = 'tool-browser-check';

UPDATE ai_tools SET status = 'disabled', risk = 'admin' WHERE id = 'tool-bash';

UPDATE plugins
SET name = '飞书群机器人',
    description = '通过群机器人 Webhook 推送待办、风险提醒和经营日报。'
WHERE id = 'plugin-feishu';

UPDATE plugins
SET name = '企业微信群机器人',
    description = '通过群机器人 Webhook 推送待办、风险提醒和经营日报。'
WHERE id = 'plugin-wecom';

UPDATE ai_tools
SET description = '在项目下创建可执行自动化。actionType 仅使用 call_ai、notify 或 tool_call；业务写入应配置 actionToolId 和 actionInput。',
    input_schema = '{"projectId":"proj-xxx","name":"任务名称","trigger":"每天9:00","triggerType":"schedule","action":"执行说明","actionType":"tool_call","agentModel":"provider-id","actionPluginId":"plugin-feishu","actionToolId":"tool-business-action","actionInput":{"operation":"create_task"},"systemPrompt":"执行约束"}'
WHERE id = 'tool-create-automation';

INSERT OR REPLACE INTO ai_tools (
  id, name, description, kind, status, risk, input_schema, example_prompt, created_at
) VALUES
  (
    'tool-business-query',
    '业务数据查询 MCP',
    '按当前企业范围查询客户、订单、付款、发票、待办、自动化和经营汇总；列表 total 是精确总量。发票逾期数使用 status=overdue；不接受任意 SQL。',
    'mcp', 'enabled', 'read_only',
    '{"resource":"invoices","status":"overdue","limit":20}',
    '查一下当前企业有哪些逾期发票，并按到期时间列出来。',
    '2026-07-17T12:00:00.000Z'
  ),
  (
    'tool-business-action',
    '业务操作 MCP',
    '在当前企业范围创建客户或待办、更新客户/订单/发票状态，或安全合并电话号码重复的客户。operation 支持 create_customer、create_task、update_customer_status、update_order_status、update_invoice_status、deduplicate_customers_by_phone。',
    'mcp', 'enabled', 'write',
    '{"operation":"create_task","name":"客户名称","title":"待办标题","description":"说明","contact":"联系人","phone":"13800000000","email":"name@example.com","address":"地址","status":"lead","priority":"high","dueDate":"2026-07-18","id":"record-id","tags":["重点"]}',
    '给负责人创建一个高优先级待办，并把这张发票标记为逾期。',
    '2026-07-17T12:01:00.000Z'
  );

UPDATE agent_personas
SET default_skill_ids = '["skill-invoice-operations","skill-sales-followup","skill-order-cash-reconciliation","skill-daily-operations-brief","skill-data-quality"]'
WHERE id = 'persona-ops-cto';

UPDATE agent_personas
SET default_skill_ids = '["skill-sales-followup","skill-data-quality"]'
WHERE id = 'persona-growth-ops';

UPDATE agent_personas
SET default_skill_ids = '["skill-daily-operations-brief","skill-invoice-operations"]'
WHERE id = 'persona-admin-ops';

INSERT OR REPLACE INTO agent_skills (
  id, name, description, tool_ids, prompt, enabled, created_at
) VALUES
  (
    'skill-invoice-operations',
    '发票异常处置',
    '查询逾期、草稿和待回款发票，形成责任清单并创建待办。',
    '["tool-business-query","tool-business-action","tool-feishu-notify"]',
    '先用业务数据查询 MCP 读取真实发票。按逾期天数、金额和客户聚合，输出发票ID、金额、到期日、风险级别和下一步。需要落地时创建待办或更新发票状态；通知工具未配置时明确提示绑定，不得声称已发送。',
    1, '2026-07-17T12:10:00.000Z'
  ),
  (
    'skill-sales-followup',
    '客户跟进运营',
    '识别重复客户、沉默线索和缺失联系方式，生成可执行跟进任务。',
    '["tool-business-query","tool-business-action","tool-mcp-company-context"]',
    '读取当前项目上下文和客户数据，检查重复电话、空联系方式、长期未更新和未分配责任人。先给出证据清单，再创建待办；只有用户明确要求去重或已存在去重自动化时才调用合并操作。',
    1, '2026-07-17T12:11:00.000Z'
  ),
  (
    'skill-order-cash-reconciliation',
    '订单回款核对',
    '核对订单、付款与发票状态，定位已付款未开票和逾期未回款。',
    '["tool-business-query","tool-business-action"]',
    '分别查询订单、付款和发票，按订单ID核对金额与状态。输出不一致记录、影响金额和建议动作。更新状态前复述目标记录ID和新状态，不得编造不存在的付款。',
    1, '2026-07-17T12:12:00.000Z'
  ),
  (
    'skill-daily-operations-brief',
    '经营日报',
    '生成客户、订单、回款、发票和自动化运行情况的每日经营摘要。',
    '["tool-business-query","tool-feishu-notify"]',
    '用经营汇总和各业务列表生成日报：先给关键数字，再列异常、责任人和明日动作。所有数字必须来自工具结果。仅在通知工具返回成功后才说已推送。',
    1, '2026-07-17T12:13:00.000Z'
  ),
  (
    'skill-data-quality',
    '业务数据治理',
    '检查客户重复、字段缺失、状态冲突和孤立业务记录。',
    '["tool-business-query","tool-business-action","tool-csv-profile"]',
    '先做只读检查并量化问题，再按影响范围排序。涉及合并或状态修改时说明变更数量和回滚风险；工具失败时保留原数据并报告错误。',
    1, '2026-07-17T12:14:00.000Z'
  );
