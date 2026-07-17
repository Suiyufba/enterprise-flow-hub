UPDATE plugins
SET name = '飞书群机器人',
    description = '通过群机器人 Webhook 推送待办、风险提醒和经营日报。'
WHERE id = 'plugin-feishu';

UPDATE plugins
SET name = '企业微信群机器人',
    description = '通过群机器人 Webhook 推送待办、风险提醒和经营日报。'
WHERE id = 'plugin-wecom';

UPDATE ai_tools
SET description = '按当前企业范围查询客户、订单、付款、发票、待办、自动化和经营汇总；列表 total 是精确总量。发票逾期数使用 status=overdue；不接受任意 SQL。'
WHERE id = 'tool-business-query';

UPDATE ai_tools
SET name = '项目表格分析 MCP',
    description = '读取当前项目已上传的 CSV、TSV、TXT、XLSX 或 XLSM，返回行数、表头、样例与空值统计。',
    input_schema = '{"fileId":"file-xxx","fileName":"客户表.xlsx","sampleRows":20}',
    status = 'enabled'
WHERE id = 'tool-csv-profile';

UPDATE agent_personas
SET default_skill_ids = '["skill-invoice-operations","skill-sales-followup","skill-order-cash-reconciliation","skill-daily-operations-brief","skill-data-quality"]'
WHERE default_skill_ids IS NULL
   OR default_skill_ids = ''
   OR default_skill_ids = '[]';
