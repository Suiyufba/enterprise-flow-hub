-- Enterprise Flow Hub Seed Data

-- Enterprises
INSERT OR IGNORE INTO enterprises (id, name) VALUES
  ('ent-qihang',  '启航留学'),
  ('ent-yunshan', '云杉贸易');

-- Users (password for all demo users is: demo123)
INSERT OR IGNORE INTO users (id, enterprise_id, username, password_hash, display_name, role, created_at) VALUES
  ('user-qihang-admin', 'ent-qihang',  'admin',   'seed-static-salt-:ff4970a0669605b999b76d4504b923203ed2d30da227f2b903f41cb084e6a6154851fed3758829ae294ecf249a3c1a37dadfe9a755d861011b0793df48b6daed', '张总',    'admin',  '2026-05-01T00:00:00.000Z'),
  ('user-qihang-li',    'ent-qihang',  'lina',    'seed-static-salt-:ff4970a0669605b999b76d4504b923203ed2d30da227f2b903f41cb084e6a6154851fed3758829ae294ecf249a3c1a37dadfe9a755d861011b0793df48b6daed', '李娜',    'member', '2026-05-01T00:00:00.000Z'),
  ('user-qihang-wang',  'ent-qihang',  'wangwei', 'seed-static-salt-:ff4970a0669605b999b76d4504b923203ed2d30da227f2b903f41cb084e6a6154851fed3758829ae294ecf249a3c1a37dadfe9a755d861011b0793df48b6daed', '王伟',    'member', '2026-05-01T00:00:00.000Z'),
  ('user-yunshan-liu',  'ent-yunshan', 'liu',     'seed-static-salt-:ff4970a0669605b999b76d4504b923203ed2d30da227f2b903f41cb084e6a6154851fed3758829ae294ecf249a3c1a37dadfe9a755d861011b0793df48b6daed', '刘总',    'admin',  '2026-05-03T00:00:00.000Z'),
  ('user-yunshan-chen', 'ent-yunshan', 'chen',    'seed-static-salt-:ff4970a0669605b999b76d4504b923203ed2d30da227f2b903f41cb084e6a6154851fed3758829ae294ecf249a3c1a37dadfe9a755d861011b0793df48b6daed', '陈运营',  'member', '2026-05-03T00:00:00.000Z');

-- Projects
INSERT OR IGNORE INTO projects (id, enterprise_id, name, description, created_at) VALUES
  ('proj-qihang-growth',  'ent-qihang',  '线索增长',   '优化线索来源、顾问跟进和签约转化。',       '2026-05-01T00:00:00.000Z'),
  ('proj-qihang-daily',   'ent-qihang',  '顾问日报',   '整理顾问每日客户动作和风险提醒。',         '2026-05-02T00:00:00.000Z'),
  ('proj-yunshan-orders', 'ent-yunshan', '订单同步',   '同步订单、付款和交付状态。',              '2026-05-03T00:00:00.000Z');

-- Conversations
INSERT OR IGNORE INTO conversations (id, enterprise_id, project_id, title, tags, created_at) VALUES
  ('chat-qihang-leads',    'ent-qihang',  'proj-qihang-growth',  '线索跟进诊断',  '["跟进","线索管理"]', '2026-05-12T00:00:00.000Z'),
  ('chat-qihang-daily',    'ent-qihang',  'proj-qihang-daily',   '顾问日报整理',  '["日报","顾问"]',     '2026-05-13T00:00:00.000Z'),
  ('chat-yunshan-payments','ent-yunshan', 'proj-yunshan-orders', '订单付款同步',  '["付款","订单"]',     '2026-05-14T00:00:00.000Z'),
  ('chat-yunshan-dashboard','ent-yunshan','proj-yunshan-orders', '老板看板规划',  '["看板","报表"]',     '2026-05-15T00:00:00.000Z');

-- Messages
INSERT OR IGNORE INTO messages (id, conversation_id, role, content, created_at) VALUES
  ('msg-leads-1', 'chat-qihang-leads', 'user',      '帮我看这组客户表和最近的聊天记录，分析一下顾问的跟进情况，看看有没有漏跟进的线索。', '2026-05-12T09:00:00.000Z'),
  ('msg-leads-2', 'chat-qihang-leads', 'assistant', '好的，我已经分析了客户表和聊天记录。发现以下情况：\n\n1. **线索池总量**：当前有 238 条线索，其中 42 条处于"新入库"状态超过 3 天未被分配。\n2. **跟进问题**：15 位顾问中有 3 位的最近跟进时间超过 7 天，涉及 28 位客户。\n3. **高风险线索**：有 5 条"已报价"阶段的线索超过 5 天没有跟进记录，流失风险较高。\n\n建议优先处理这 5 条高风险线索，并对 3 位滞后顾问进行提醒。', '2026-05-12T09:00:15.000Z'),
  ('msg-leads-3', 'chat-qihang-leads', 'user',      '怎么减少顾问漏跟进的情况？帮我设计一个自动化流程。', '2026-05-12T09:01:00.000Z'),
  ('msg-leads-4', 'chat-qihang-leads', 'assistant', '可以建立以下自动化规则：\n\n**规则 1：新线索自动分配**\n- 触发：线索入库后 2 小时内\n- 动作：按顾问当前负载自动分配给最空闲的顾问\n\n**规则 2：跟进超时提醒**\n- 触发：线索在任一阶段停留超过 3 天\n- 动作：飞书通知负责顾问 + 同步到老板看板\n\n**规则 3：报价后强制跟进**\n- 触发：线索进入「已报价」阶段\n- 动作：创建 3 天后的跟进待办，超时未完成升级给主管\n\n需要我帮你把这些规则配置到自动化里吗？', '2026-05-12T09:01:30.000Z'),
  ('msg-daily-1', 'chat-qihang-daily', 'user',      '整理一下今天所有顾问的客户动作，生成日报。', '2026-05-13T17:00:00.000Z'),
  ('msg-daily-2', 'chat-qihang-daily', 'assistant', '今日顾问日报（5月13日）：\n\n**整体数据**\n- 今日新增线索：12 条\n- 今日跟进记录：47 次\n- 今日签约：3 单\n- 今日流失：1 条（客户明确拒绝）\n\n**需关注事项**\n- 顾问张伟：报价 5 单，跟进频率偏低\n- 顾问李娜：今日无新增跟进，需确认原因\n- 客户王某：连续 3 天未回复消息，建议电话联系', '2026-05-13T17:00:20.000Z'),
  ('msg-pay-1',   'chat-yunshan-payments', 'user',      '分析订单表，帮我找出付款状态不同步的订单。', '2026-05-14T10:00:00.000Z'),
  ('msg-pay-2',   'chat-yunshan-payments', 'assistant', '分析完成，发现以下问题：\n\n1. **已付款未发货**：3 笔订单（#1023、#1028、#1035）付款已到账超过 24 小时，但状态仍为「待发货」。\n2. **部分付款未标记**：订单 #1041 收到 50% 定金，系统未记录付款流水。\n3. **已发货未签收**：7 笔订单物流显示已签收，但系统状态仍为「运输中」。\n\n建议先处理 3 笔已付款未发货的订单，通知仓库优先安排。', '2026-05-14T10:00:25.000Z'),
  ('msg-dash-1',  'chat-yunshan-dashboard', 'user',      '老板想要一个实时看板，能看到每天的订单、付款、发货和利润。帮我规划一下需要哪些指标。', '2026-05-15T14:00:00.000Z'),
  ('msg-dash-2',  'chat-yunshan-dashboard', 'assistant', '老板看板建议指标：\n\n**今日概览**\n- 今日订单数 / 金额\n- 今日付款到账 / 金额\n- 今日发货数\n- 今日签收数\n\n**效率指标**\n- 订单→付款 平均间隔\n- 付款→发货 平均间隔\n- 发货→签收 平均间隔\n\n**异常预警**\n- 超 24h 未付款订单数\n- 超 48h 未发货订单数\n- 超 7 天未签收订单数\n\n**利润看板**\n- 今日毛利（销售额 - 成本）\n- 本月累计毛利\n- 毛利率趋势图\n\n需要我帮你在自动化里创建这个看板的数据推送规则吗？', '2026-05-15T14:00:30.000Z');

-- Library Items
INSERT OR IGNORE INTO library_items (id, enterprise_id, project_id, name, type, summary, visibility, created_at) VALUES
  ('lib-qihang-leads-sheet',   'ent-qihang',  'proj-qihang-growth',  '线索表截图样例',   'screenshot',  '包含客户来源、顾问、阶段和最近跟进时间。',                 'public',  '2026-05-16T00:00:00.000Z'),
  ('lib-qihang-daily-template','ent-qihang',  'proj-qihang-daily',   '顾问日报模板',     'document',    '每日客户动作和风险提醒的标准日报格式。',                   'private', '2026-05-18T00:00:00.000Z'),
  ('lib-yunshan-order-sheet',  'ent-yunshan', 'proj-yunshan-orders', '订单状态表',       'spreadsheet', '用于识别订单、付款、发货和签收状态。',                     'public',  '2026-05-17T00:00:00.000Z'),
  ('lib-yunshan-pricing-notes','ent-yunshan', 'proj-yunshan-orders', '定价策略备注',     'note',        '各渠道定价规则和折扣审批流程说明。',                       'private', '2026-05-19T00:00:00.000Z');

-- Plugins
INSERT OR IGNORE INTO plugins (id, name, description, enabled) VALUES
  ('plugin-feishu', '飞书多维表格',   '读取表格字段并生成流程诊断。',         1),
  ('plugin-wecom',  '企业微信智能机器人',   '通过长连接 API 接收指令并把待办、风险提醒推送给负责人。',     0),
  ('plugin-csv',    'CSV 导入',       '导入表格样本作为资料库素材。',         1);

-- AI Tool Registry
INSERT OR IGNORE INTO ai_tools (id, name, description, kind, status, risk, input_schema, example_prompt, created_at) VALUES
  (
    'tool-csv-profile',
    'CSV/Excel 结构识别',
    '读取表格表头、样例行和缺失字段，给 AI 提供可引用的数据画像。',
    'cli',
    'enabled',
    'read_only',
    '{"fileName":"leads.csv","sampleRows":20}',
    '分析这个线索表，找出顾问漏跟进和字段缺失的问题。',
    '2026-05-20T00:00:00.000Z'
  ),
  (
    'tool-feishu-notify',
    '飞书/企业微信通知',
    '把 AI 生成的待办、风险提醒或日报推送给指定负责人。',
    'http',
    'needs_config',
    'write',
    '{"channel":"sales-alerts","message":"报价超时客户清单"}',
    '把这 5 条高风险线索发给负责顾问和主管。',
    '2026-05-20T00:00:00.000Z'
  ),
  (
    'tool-browser-check',
    '网页流程巡检',
    '让 Agent 打开指定后台页面，检查按钮、表格和状态是否符合预期。',
    'browser',
    'enabled',
    'read_only',
    '{"url":"https://crm.example.com/leads","checks":["是否有未分配线索"]}',
    '打开 CRM 线索页，看看今天有没有未分配的新线索。',
    '2026-05-20T00:00:00.000Z'
  ),
  (
    'tool-mcp-company-context',
    '企业资料 MCP',
    '通过 MCP 暴露企业资料库、项目上下文和历史对话给 AI 读取。',
    'mcp',
    'enabled',
    'read_only',
    '{"projectId":"proj-qihang-growth","query":"线索阶段定义"}',
    '先查资料库里的线索阶段定义，再设计自动化流程。',
    '2026-05-20T00:00:00.000Z'
  ),
  (
    'tool-bash',
    'Bash 命令执行',
    '在服务器上执行 bash 命令：构建部署、安装依赖、git 操作、文件管理、重启服务等。Agent 可以用这个工具真正执行操作而不只是给建议。',
    'cli',
    'enabled',
    'read_only',
    '{"command":"npm run build","cwd":"/app"}',
    '帮我把代码部署到生产环境。',
    '2026-05-25T00:00:00.000Z'
  ),
  (
    'tool-create-library-item',
    '创建业务资料',
    '在项目下创建一条业务资料记录（客户、订单、文档等）。Agent 应该用它来持久化用户的业务数据。',
    'cli',
    'enabled',
    'write',
    '{"enterpriseId":"ent-xxx","projectId":"proj-xxx","name":"客户名称","type":"note","summary":"客户详细信息","visibility":"public"}',
    '帮我记录一个新客户张三，联系方式是...',
    '2026-05-26T00:00:00.000Z'
  ),
  (
    'tool-create-automation',
    '创建自动化规则',
    '在项目下创建一条自动化规则（定时任务、消息触发、通知推送等）。Agent 用它来将用户的自动化需求落地。',
    'cli',
    'enabled',
    'write',
    '{"projectId":"proj-xxx","name":"每日清理","trigger":"每天早上9:00","triggerType":"schedule","action":"删除重复电话号码","actionType":"call_ai"}',
    '帮我设置每天早上9点自动清理重复的电话号码',
    '2026-05-27T00:00:00.000Z'
  );

-- Agent Skills
INSERT OR IGNORE INTO agent_skills (id, name, description, tool_ids, prompt, enabled, created_at) VALUES
  (
    'skill-table-diagnosis',
    '表格诊断',
    '识别 Excel/CSV 字段、阶段、空值、重复和异常流程。',
    '["tool-csv-profile","tool-mcp-company-context"]',
    '优先检查字段结构、阶段流转、空值率、重复客户和超时未跟进记录，输出可执行修复建议。',
    1,
    '2026-05-21T00:00:00.000Z'
  ),
  (
    'skill-notification-workflow',
    '通知自动化',
    '把风险线索、日报和订单异常转成飞书/企业微信提醒。',
    '["tool-feishu-notify","tool-mcp-company-context"]',
    '把业务异常整理成接收人、触发条件、消息模板和升级规则。',
    1,
    '2026-05-21T00:00:00.000Z'
  ),
  (
    'skill-browser-audit',
    '后台巡检',
    '检查没有 API 的 CRM/ERP 网页后台并形成结构化观察。',
    '["tool-browser-check"]',
    '打开指定后台页面，按用户目标检查关键表格、状态、按钮和异常提示。',
    1,
    '2026-05-21T00:00:00.000Z'
  );

-- Model Providers
INSERT OR IGNORE INTO model_providers (id, name, base_url, model, api_key_env, enabled) VALUES
  ('provider-deepseek', 'DeepSeek', 'https://api.deepseek.com', 'deepseek-chat', 'DEEPSEEK_API_KEY', 1);

-- Agent Personas
INSERT OR IGNORE INTO agent_personas (id, name, role, description, system_prompt, default_skill_ids, provider_id, enabled) VALUES
  (
    'persona-ops-cto',
    '轻量自动化 CTO',
    '业务系统架构师',
    '把零散 SaaS、表格、聊天记录和人工流程串成可执行方案。',
    '你是中小企业的轻量自动化 CTO。先识别业务对象、流程断点和可自动化节点，再给出低成本落地方案。',
    '["skill-table-diagnosis","skill-notification-workflow"]',
    'provider-deepseek',
    1
  ),
  (
    'persona-growth-ops',
    '线索增长顾问',
    '销售运营专家',
    '专注线索分配、顾问跟进、报价超时和转化漏斗。',
    '你是销售运营专家。所有建议都要围绕线索来源、阶段推进、跟进频率、转化率和负责人动作。',
    '["skill-table-diagnosis","skill-notification-workflow"]',
    'provider-deepseek',
    1
  ),
  (
    'persona-admin-ops',
    '行政流程管家',
    '运营/行政自动化专家',
    '处理日报、报销、资料整理、通知和跨工具同步。',
    '你是运营行政自动化专家。目标是减少重复劳动，明确模板、负责人、提醒节奏和异常升级规则。',
    '["skill-notification-workflow","skill-browser-audit"]',
    'provider-deepseek',
    1
  );

-- Automations
INSERT OR IGNORE INTO automations (id, project_id, name, trigger_desc, trigger_type, action_desc, action_type, agent_model, system_prompt, enabled, run_count, last_run) VALUES
  ('auto-qihang-overdue',      'proj-qihang-growth',  '报价超时跟进提醒',   '客户在已报价阶段停留超过 3 天',       'schedule', '飞书通知负责顾问 + 同步老板看板',           'notify',    'claude-opus-4-7',  '你是销售管理助手，负责监控线索跟进状态，发现超时未跟进时及时提醒。',                               1, 342, '2026-05-24T09:00:00.000Z'),
  ('auto-yunshan-paid',         'proj-yunshan-orders', '付款完成通知发货',   '订单状态变更为已付款',                 'webhook',  '通知运营安排发货 + 更新物流系统',             'api_call',  'claude-sonnet-4-6', '你是订单管理助手，监控付款状态并在到账后触发发货流程。',                                             1, 87,  '2026-05-24T14:30:00.000Z'),
  ('auto-qihang-daily-report',  'proj-qihang-daily',   '每日顾问日报生成',   '每个工作日 18:00',                     'schedule', '汇总当日跟进数据 → AI 生成日报 → 发企业微信群','call_ai',   'claude-opus-4-7',  '你是日报生成助手，根据当日顾问动作数据生成结构化日报，突出风险项。',                               1, 56,  '2026-05-23T18:00:00.000Z'),
  ('auto-yunshan-stock-alert',  'proj-yunshan-orders', '库存预警通知',       '商品库存低于安全阈值',                 'file',     '发送邮件给采购 + 创建补货工单',               'send_email','claude-haiku-4-5',  NULL,                                                                                        0, 12,  '2026-05-20T08:00:00.000Z'),
  ('auto-qihang-lead-score',    'proj-qihang-growth',  '新线索自动评分分配', '新线索入库',                           'webhook',  'AI 评分 → 自动分配给最合适顾问',             'call_ai',   'claude-opus-4-7',  '你是线索评估专家，根据客户画像和历史数据对新线索打分并匹配最佳顾问。',                           1, 128, '2026-05-24T15:12:00.000Z');
