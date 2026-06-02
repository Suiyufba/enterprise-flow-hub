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
  ),
  (
    'skill-finance-pitch-builder',
    'Pitch Builder',
    '为融资、投研或客户汇报生成 Pitchbook、投资建议书和配套邮件。',
    '["tool-mcp-company-context","tool-create-library-item"]',
    '你是投行 Pitchbook 助手。先明确客户/标的/交易目标，再输出 comps 思路、PPT 大纲、关键图表、客户邮件和风险提示。不要编造数据；缺少财务数据时列出需要补充的表格字段。',
    1,
    '2026-05-29T00:00:00.000Z'
  ),
  (
    'skill-finance-model-builder',
    'Model Builder',
    '搭建 DCF、三表联动、敏感性分析和蒙特卡洛估值模型。',
    '["tool-csv-profile","tool-mcp-company-context"]',
    '你是金融模型搭建助手。根据输入的公司、财务表或假设，设计 DCF/三表联动/敏感性分析步骤，输出关键假设、公式结构、检查项和估值结论；所有数字必须说明来源或标记为假设。',
    1,
    '2026-05-29T00:01:00.000Z'
  ),
  (
    'skill-finance-earnings-reviewer',
    'Earnings Reviewer',
    '阅读财报、10-K/10-Q 和电话会纪要，提炼业绩变化与交易判断。',
    '["tool-csv-profile","tool-mcp-company-context"]',
    '你是财报审阅员。先提取收入、利润率、现金流、指引和管理层语气变化，再判断业绩好坏、估值影响、是否加仓/减仓，并列出需要核验的财报页码或原文依据。',
    1,
    '2026-05-29T00:02:00.000Z'
  ),
  (
    'skill-finance-kyc-screener',
    'KYC Screener',
    '做客户背景调查、反洗钱初筛、制裁名单和交易风险梳理。',
    '["tool-mcp-company-context","tool-browser-check"]',
    '你是 KYC/AML 初筛助手。围绕客户主体、实控人、业务关系、诉讼制裁、负面新闻和交易异常做检查，输出风险等级、证据、缺口资料和下一步尽调问题。',
    1,
    '2026-05-29T00:03:00.000Z'
  ),
  (
    'skill-finance-k-dense-scientific',
    'K-Dense Scientific',
    '对 Excel/CSV 金融数据做 ARIMA、GARCH、Monte Carlo、回测和相关性分析。',
    '["tool-csv-profile","tool-create-library-item"]',
    '你是量化数据分析助手。先识别时间序列、收益率、缺失值和异常值，再给出 ARIMA/GARCH/Monte Carlo/相关性/回测方案，输出图表建议、指标解释、代码或公式草案和风险限制。',
    1,
    '2026-05-29T00:04:00.000Z'
  ),
  (
    'skill-finance-awesome-finance',
    'Awesome Finance',
    '聚合财经新闻、市场情绪、热点板块和预测信号，生成每日市场摘要。',
    '["tool-browser-check","tool-mcp-company-context"]',
    '你是每日市场情绪分析助手。按新闻、社媒热度、预测市场、板块轮动和情绪得分组织信息，输出偏多/偏空判断、热点板块、风险事件和需要继续跟踪的数据源。',
    1,
    '2026-05-29T00:05:00.000Z'
  ),
  (
    'skill-finance-equity-research',
    'Equity Research',
    '生成个股投研框架、Bull/Base/Bear 情景、目标价和风险清单。',
    '["tool-browser-check","tool-mcp-company-context"]',
    '你是股票研究员。围绕商业模式、财务表现、估值、催化剂、风险、内部人交易和 ESG 检查，输出 Bull/Base/Bear 三情景、12 个月目标价逻辑和可验证的数据清单。',
    1,
    '2026-05-29T00:06:00.000Z'
  ),
  (
    'skill-finance-office-skills',
    'Claude Office Skills',
    '把 Excel 明细、公式审计、三表联动和图表任务变成可执行办公流程。',
    '["tool-csv-profile","tool-create-library-item"]',
    '你是 Excel/Office 办公自动化助手。优先处理 dcf、lbo、comps、三表联动、audit-xls、公式审计和模板刷新；输出清晰公式、表结构、异常检查和可复制步骤。',
    1,
    '2026-05-29T00:07:00.000Z'
  ),
  (
    'skill-finance-claude-excel-ppt',
    'Claude for Excel/PPT',
    '在 Excel/PPT/Word 场景里做数据联动、图表更新、讲稿和改稿。',
    '["tool-csv-profile","tool-create-library-item"]',
    '你是 Excel/PPT/Word 协作助手。把数据表转换成透视分析、图表、PPT 页面结构和讲稿；每次输出都包含可粘贴的表格字段、页面标题、图表类型和修改建议。',
    1,
    '2026-05-29T00:08:00.000Z'
  ),
  (
    'skill-finance-openclaw',
    'OpenClaw 一人量化',
    '搭建常驻量化研究 Agent：自动抓数据、滚动回测、风险监控和信号推送。',
    '["tool-mcp-company-context","tool-browser-check","tool-create-automation"]',
    '你是 24 小时量化研究 Agent。为用户设计数据抓取、策略迭代、滚动回测、异常推送和风险监控流程；输出可自动化的任务、触发器、指标阈值和验证方法。',
    1,
    '2026-05-29T00:09:00.000Z'
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

-- ============================================================
-- Phase 4: Business Demo Data (Customers, Products, Orders, etc.)
-- ============================================================

-- Customers (启航留学)
INSERT OR IGNORE INTO customers (id, enterprise_id, name, contact, phone, email, address, tags, status, created_at, updated_at) VALUES
  ('cust-qihang-zhao',  'ent-qihang', '赵明',  '赵明爸爸',  '13800001001', 'zhaoming@example.com', '北京市海淀区中关村大街1号',      '["VIP","美本申请"]',        'active', '2026-05-10T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('cust-qihang-qian',  'ent-qihang', '钱晓',  '钱晓本人',  '13800001002', 'qianxiao@example.com', '上海市徐汇区衡山路88号',        '["英硕咨询","大二在读"]',    'lead',   '2026-05-15T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('cust-qihang-sun',   'ent-qihang', '孙磊',  '孙磊本人',  '13800001003', 'sunlei@example.com',   '深圳市南山区科技园路16号',        '["雅思备考","在职"]',        'active', '2026-05-08T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('cust-qihang-zhou',  'ent-qihang', '周芳',  '周芳妈妈',  '13800001004', 'zhoufang@example.com', '广州市天河区体育西路22号',        '["澳洲本科","高三在读"]',    'lead',   '2026-05-20T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('cust-qihang-wu',    'ent-qihang', '吴鹏',  '吴鹏姑姑',  '13800001005', 'wupeng@example.com',   '杭州市西湖区文三路55号',         '["美研申请","已签约竞品"]',  'lost',   '2026-04-01T00:00:00.000Z', '2026-05-15T00:00:00.000Z');

-- Customers (云杉贸易)
INSERT OR IGNORE INTO customers (id, enterprise_id, name, contact, phone, email, address, tags, status, created_at, updated_at) VALUES
  ('cust-yunshan-dongnan', 'ent-yunshan', '东南商贸', '陈经理', '13900002001', 'chen@dongnan-trade.com', '南京市鼓楼区中山北路100号',    '["长期合作","批发客户"]',  'active', '2026-05-01T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('cust-yunshan-hualian', 'ent-yunshan', '华联超市', '王采购', '13900002002', 'wang@hualian.com',      '成都市锦江区春熙路8号',         '["连锁超市","月结客户"]',  'active', '2026-05-05T00:00:00.000Z', '2026-05-28T00:00:00.000Z');

-- Suppliers
INSERT OR IGNORE INTO suppliers (id, enterprise_id, name, contact, phone, email, address, created_at, updated_at) VALUES
  ('sup-qihang-xinhangdao', 'ent-qihang',  '新航道教育', '刘老师', '13600003001', 'liu@xhd.com',    '北京市朝阳区国贸大厦15层',    '2026-05-10T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('sup-qihang-huanqiu',    'ent-qihang',  '环球留学服务', '张主管', '13600003002', 'zhang@huanqiu.com', '上海市静安区南京西路1688号', '2026-05-12T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('sup-yunshan-zhejiang',  'ent-yunshan', '浙江纺织集团', '黄经理', '13700003001', 'huang@zjtex.com', '杭州市萧山区纺织产业园',      '2026-05-03T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('sup-yunshan-dongguan',  'ent-yunshan', '东莞电子科技', '林销售', '13700003002', 'lin@dg-elec.com', '东莞市长安镇科技路12号',       '2026-05-06T00:00:00.000Z', '2026-05-28T00:00:00.000Z');

-- Products (启航留学 — Education Services)
INSERT OR IGNORE INTO products (id, enterprise_id, name, sku, category, unit_price, unit, description, created_at, updated_at) VALUES
  ('prod-qihang-us-ug',  'ent-qihang', '美国本科申请服务',  'SKU-US-UG',   '留学申请',  68000, '套', '包含选校规划、文书指导、面试辅导、签证协助的全套美国本科申请服务',  '2026-05-10T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('prod-qihang-uk-pg',  'ent-qihang', '英国硕士申请服务',  'SKU-UK-PG',   '留学申请',  48000, '套', '英国G5及罗素集团硕士申请全套服务，含研究计划辅导',              '2026-05-10T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('prod-qihang-ielts',  'ent-qihang', '雅思一对一培训',    'SKU-IELTS',   '语言培训',  12000, '期', '40课时雅思一对一精讲，听说读写全科覆盖，赠送模考3次',          '2026-05-10T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('prod-qihang-sat',    'ent-qihang', 'SAT强化课程',       'SKU-SAT',     '考试培训',  15800, '期', '60课时SAT强化训练，覆盖阅读、文法、数学，赠送全真模考5次',     '2026-05-10T00:00:00.000Z', '2026-05-28T00:00:00.000Z');

-- Products (云杉贸易 — Physical Goods)
INSERT OR IGNORE INTO products (id, enterprise_id, name, sku, category, unit_price, unit, description, created_at, updated_at) VALUES
  ('prod-yunshan-tshirt',  'ent-yunshan', '棉质T恤',        'SKU-CL-T001', '服装',   45,   '件', '纯棉圆领短袖T恤，多色可选，常规版型',          '2026-05-05T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('prod-yunshan-earphone','ent-yunshan', '蓝牙耳机',        'SKU-EL-E001', '电子',   128,  '个', '蓝牙5.3无线耳机，降噪，续航40小时',             '2026-05-06T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('prod-yunshan-cup',     'ent-yunshan', '不锈钢保温杯',    'SKU-DY-C001', '日用品', 68,   '个', '316不锈钢保温杯，500ml，12小时保温',            '2026-05-06T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('prod-yunshan-chair',   'ent-yunshan', '办公椅',          'SKU-FN-C001', '家具',   580,  '把', '人体工学办公椅，网布靠背，可升降扶手',          '2026-05-07T00:00:00.000Z', '2026-05-28T00:00:00.000Z');

-- Orders
INSERT OR IGNORE INTO orders (id, enterprise_id, customer_id, status, total_amount, notes, created_at, updated_at) VALUES
  ('ord-qihang-zhao-us',       'ent-qihang',  'cust-qihang-zhao',       'confirmed', 83800, 'VIP客户赵明——美本申请+SAT培训',                                  '2026-05-20T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('ord-qihang-sun-ielts',     'ent-qihang',  'cust-qihang-sun',        'delivered', 12000, '孙磊雅思一对一培训',                                              '2026-05-15T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
  ('ord-yunshan-dongnan-1',    'ent-yunshan', 'cust-yunshan-dongnan',   'shipped',   79000, '东南商贸大宗采购——服装+日用品',                                  '2026-05-18T00:00:00.000Z', '2026-05-30T00:00:00.000Z'),
  ('ord-yunshan-hualian-1',    'ent-yunshan', 'cust-yunshan-hualian',   'processing',25600, '华联超市蓝牙耳机渠道铺货',                                        '2026-05-25T00:00:00.000Z', '2026-05-29T00:00:00.000Z');

-- Order Items
INSERT OR IGNORE INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES
  ('oi-zhao-us',    'ord-qihang-zhao-us',    'prod-qihang-us-ug',  1, 68000, 68000),
  ('oi-zhao-sat',   'ord-qihang-zhao-us',    'prod-qihang-sat',    1, 15800, 15800),
  ('oi-sun-ielts',  'ord-qihang-sun-ielts',  'prod-qihang-ielts',  1, 12000, 12000),
  ('oi-dongnan-t',  'ord-yunshan-dongnan-1', 'prod-yunshan-tshirt',1000, 45, 45000),
  ('oi-dongnan-c',  'ord-yunshan-dongnan-1', 'prod-yunshan-cup',   500,  68, 34000),
  ('oi-hualian-e',  'ord-yunshan-hualian-1', 'prod-yunshan-earphone',200,128,25600);

-- Payments
INSERT OR IGNORE INTO payments (id, enterprise_id, order_id, amount, method, status, received_at, created_at) VALUES
  ('pay-zhao-1',   'ent-qihang',  'ord-qihang-zhao-us',      83800, 'alipay',       'completed', '2026-05-21T00:00:00.000Z', '2026-05-21T00:00:00.000Z'),
  ('pay-sun-1',    'ent-qihang',  'ord-qihang-sun-ielts',    12000, 'wechat',       'completed', '2026-05-16T00:00:00.000Z', '2026-05-16T00:00:00.000Z'),
  ('pay-dongnan-1','ent-yunshan', 'ord-yunshan-dongnan-1',   79000, 'bank_transfer', 'completed', '2026-05-20T00:00:00.000Z', '2026-05-20T00:00:00.000Z'),
  ('pay-hualian-1', 'ent-yunshan','ord-yunshan-hualian-1',   25600, 'bank_transfer', 'pending',   NULL,                        '2026-05-26T00:00:00.000Z');

-- Invoices
INSERT OR IGNORE INTO invoices (id, enterprise_id, order_id, customer_id, amount, status, due_date, issued_at, created_at) VALUES
  ('inv-zhao-1',    'ent-qihang',  'ord-qihang-zhao-us',    'cust-qihang-zhao',        83800, 'paid',     '2026-06-20T00:00:00.000Z', '2026-05-20T00:00:00.000Z', '2026-05-20T00:00:00.000Z'),
  ('inv-dongnan-1', 'ent-yunshan', 'ord-yunshan-dongnan-1', 'cust-yunshan-dongnan',   79000, 'paid',     '2026-06-18T00:00:00.000Z', '2026-05-18T00:00:00.000Z', '2026-05-18T00:00:00.000Z'),
  ('inv-hualian-1', 'ent-yunshan', 'ord-yunshan-hualian-1', 'cust-yunshan-hualian',   25600, 'issued',   '2026-06-25T00:00:00.000Z', '2026-05-25T00:00:00.000Z', '2026-05-25T00:00:00.000Z');
