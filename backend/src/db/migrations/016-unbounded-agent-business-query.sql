UPDATE ai_tools
SET description = '按当前企业和业务子类查询客户、重复审计、客户价值、订单、付款、发票、待办、自动化、资料库与经营汇总。不传 limit 时返回当前范围全部匹配记录；limit 仅用于用户明确要求的前 N 条或抽样。客户重复必须使用 resource=customer_duplicates，summary 是全量聚合。',
    input_schema = '{"resource":"customers","status":"","search":"","limit":"可选；不传即返回全部匹配记录"}'
WHERE id = 'tool-business-query';
