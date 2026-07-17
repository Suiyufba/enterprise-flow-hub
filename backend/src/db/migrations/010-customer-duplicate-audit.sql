UPDATE ai_tools
SET description = '按当前企业范围查询客户、客户全库重复审计、订单、付款、发票、待办、自动化和经营汇总。客户重复必须使用 resource=customer_duplicates；summary 是全库聚合，limit 只限制明细。',
    input_schema = '{"resource":"customer_duplicates","status":"","search":"","limit":20}'
WHERE id = 'tool-business-query';

UPDATE agent_skills
SET prompt = '先用 resource=customer_duplicates 对企业全部客户做聚合审计，禁止根据 customers 分页明细判断无重复。电话和邮箱重复属于强证据，同名只列为待人工确认候选。再检查空联系方式、长期未更新和未分配责任人，先给证据清单；只有用户明确要求时才执行合并。'
WHERE id = 'skill-sales-followup';

UPDATE agent_skills
SET prompt = '客户重复必须使用 resource=customer_duplicates 做全库聚合，报告 scannedCustomers、电话/邮箱重复组和同名候选组；禁止从分页列表推断全库结果。再检查字段缺失、状态冲突和孤立记录。涉及合并或状态修改时说明变更数量和回滚风险。'
WHERE id = 'skill-data-quality';
