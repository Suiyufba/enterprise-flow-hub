UPDATE ai_tools
SET description = '按当前企业范围查询客户、客户全库重复审计、客户价值排名、订单、付款、发票、待办、自动化和经营汇总。客户价值分析必须使用 resource=customer_value，由数据库对全量客户聚合；客户重复必须使用 resource=customer_duplicates。',
    input_schema = '{"resource":"customer_value","status":"","search":"","limit":10}'
WHERE id = 'tool-business-query';

UPDATE agent_skills
SET prompt = prompt || '\n客户价值、重点客户、最大客户等排名问题必须使用 resource=customer_value；该资源会在数据库内聚合全部客户、订单、已回款和应收，不得分页拉取 customers/orders 后自行拼接。'
WHERE id IN ('skill-sales-followup','skill-daily-operations-brief');
