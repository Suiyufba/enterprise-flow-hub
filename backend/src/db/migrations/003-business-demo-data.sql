-- Phase 4: Business Demo Data — populate customers, products, orders etc.
-- Uses INSERT OR IGNORE — safe to re-run on existing databases.

-- Customers (启航留学 — Education Agency)
INSERT OR IGNORE INTO customers (id, enterprise_id, name, contact, phone, email, address, tags, status, created_at, updated_at) VALUES
  ('cust-qihang-zhao',  'ent-qihang', '赵明',  '赵明爸爸',  '13800001001', 'zhaoming@example.com', '北京市海淀区中关村大街1号',      '["VIP","美本申请"]',        'active', '2026-05-10T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('cust-qihang-qian',  'ent-qihang', '钱晓',  '钱晓本人',  '13800001002', 'qianxiao@example.com', '上海市徐汇区衡山路88号',        '["英硕咨询","大二在读"]',    'lead',   '2026-05-15T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('cust-qihang-sun',   'ent-qihang', '孙磊',  '孙磊本人',  '13800001003', 'sunlei@example.com',   '深圳市南山区科技园路16号',        '["雅思备考","在职"]',        'active', '2026-05-08T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('cust-qihang-zhou',  'ent-qihang', '周芳',  '周芳妈妈',  '13800001004', 'zhoufang@example.com', '广州市天河区体育西路22号',        '["澳洲本科","高三在读"]',    'lead',   '2026-05-20T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('cust-qihang-wu',    'ent-qihang', '吴鹏',  '吴鹏姑姑',  '13800001005', 'wupeng@example.com',   '杭州市西湖区文三路55号',         '["美研申请","已签约竞品"]',  'lost',   '2026-04-01T00:00:00.000Z', '2026-05-15T00:00:00.000Z');

-- Customers (云杉贸易 — Trading)
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
  ('ord-qihang-zhao-us',       'ent-qihang',  'cust-qihang-zhao',       'confirmed',  83800, 'VIP客户赵明——美本申请+SAT培训',                  '2026-05-20T00:00:00.000Z', '2026-05-28T00:00:00.000Z'),
  ('ord-qihang-sun-ielts',     'ent-qihang',  'cust-qihang-sun',        'delivered',  12000, '孙磊雅思一对一培训',                              '2026-05-15T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
  ('ord-yunshan-dongnan-1',    'ent-yunshan', 'cust-yunshan-dongnan',   'shipped',    79000, '东南商贸大宗采购——服装+日用品',                  '2026-05-18T00:00:00.000Z', '2026-05-30T00:00:00.000Z'),
  ('ord-yunshan-hualian-1',    'ent-yunshan', 'cust-yunshan-hualian',   'processing', 25600, '华联超市蓝牙耳机渠道铺货',                        '2026-05-25T00:00:00.000Z', '2026-05-29T00:00:00.000Z');

-- Order Items
INSERT OR IGNORE INTO order_items (id, order_id, product_id, quantity, unit_price, subtotal) VALUES
  ('oi-zhao-us',    'ord-qihang-zhao-us',    'prod-qihang-us-ug',    1,    68000, 68000),
  ('oi-zhao-sat',   'ord-qihang-zhao-us',    'prod-qihang-sat',      1,    15800, 15800),
  ('oi-sun-ielts',  'ord-qihang-sun-ielts',  'prod-qihang-ielts',    1,    12000, 12000),
  ('oi-dongnan-t',  'ord-yunshan-dongnan-1', 'prod-yunshan-tshirt',  1000, 45,    45000),
  ('oi-dongnan-c',  'ord-yunshan-dongnan-1', 'prod-yunshan-cup',     500,  68,    34000),
  ('oi-hualian-e',  'ord-yunshan-hualian-1', 'prod-yunshan-earphone',200,  128,   25600);

-- Payments
INSERT OR IGNORE INTO payments (id, enterprise_id, order_id, amount, method, status, received_at, created_at) VALUES
  ('pay-zhao-1',    'ent-qihang',  'ord-qihang-zhao-us',      83800, 'alipay',        'completed', '2026-05-21T00:00:00.000Z', '2026-05-21T00:00:00.000Z'),
  ('pay-sun-1',     'ent-qihang',  'ord-qihang-sun-ielts',    12000, 'wechat',        'completed', '2026-05-16T00:00:00.000Z', '2026-05-16T00:00:00.000Z'),
  ('pay-dongnan-1', 'ent-yunshan', 'ord-yunshan-dongnan-1',   79000, 'bank_transfer', 'completed', '2026-05-20T00:00:00.000Z', '2026-05-20T00:00:00.000Z'),
  ('pay-hualian-1', 'ent-yunshan', 'ord-yunshan-hualian-1',   25600, 'bank_transfer', 'pending',   NULL,                        '2026-05-26T00:00:00.000Z');

-- Invoices
INSERT OR IGNORE INTO invoices (id, enterprise_id, order_id, customer_id, amount, status, due_date, issued_at, created_at) VALUES
  ('inv-zhao-1',    'ent-qihang',  'ord-qihang-zhao-us',    'cust-qihang-zhao',        83800, 'paid',   '2026-06-20T00:00:00.000Z', '2026-05-20T00:00:00.000Z', '2026-05-20T00:00:00.000Z'),
  ('inv-dongnan-1', 'ent-yunshan', 'ord-yunshan-dongnan-1', 'cust-yunshan-dongnan',   79000, 'paid',   '2026-06-18T00:00:00.000Z', '2026-05-18T00:00:00.000Z', '2026-05-18T00:00:00.000Z'),
  ('inv-hualian-1', 'ent-yunshan', 'ord-yunshan-hualian-1', 'cust-yunshan-hualian',   25600, 'issued', '2026-06-25T00:00:00.000Z', '2026-05-25T00:00:00.000Z', '2026-05-25T00:00:00.000Z');
