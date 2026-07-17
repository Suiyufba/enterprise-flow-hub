ALTER TABLE customers ADD COLUMN gender TEXT NOT NULL DEFAULT 'unknown'
  CHECK (gender IN ('unknown','male','female','other'));

ALTER TABLE suppliers ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

ALTER TABLE enterprises ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

UPDATE ai_tools
SET description = '在当前企业范围创建客户或待办、更新客户/订单/发票状态，或安全合并电话号码重复的客户。创建客户支持 gender 和 tags。operation 支持 create_customer、create_task、update_customer_status、update_order_status、update_invoice_status、deduplicate_customers_by_phone。',
    input_schema = '{"operation":"create_customer","name":"客户名称","contact":"联系人","phone":"电话","email":"邮箱","address":"地址","gender":"unknown|male|female|other","tags":["重点客户"],"status":"lead"}'
WHERE id = 'tool-business-action';
