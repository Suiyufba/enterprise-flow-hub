UPDATE ai_tools
SET description = '在当前企业和业务子类范围创建客户或待办，更新客户资料或客户/订单/发票状态，或安全合并电话号码重复的客户。update_customer 可修改姓名、联系人、电话、邮箱、地址、gender、tags、status，使用客户 id 或当前业务子类内唯一 phone 定位。operation 支持 create_customer、create_task、update_customer、update_customer_status、update_order_status、update_invoice_status、deduplicate_customers_by_phone。',
    input_schema = '{"operation":"update_customer","id":"客户ID（优先）","phone":"唯一手机号（无 ID 时定位）","name":"客户名称","contact":"联系人","email":"邮箱","address":"地址","gender":"unknown|male|female|other","tags":["重点客户"],"status":"active|inactive|lead|lost"}'
WHERE id = 'tool-business-action';
