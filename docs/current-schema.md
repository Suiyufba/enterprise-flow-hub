# 当前数据库 Schema 说明

## 1. 文件职责

- `backend/src/db/schema.sql`：最早期基础表，只负责兼容新库启动，不再完整描述当前产品。
- `backend/src/db/migrations/*.sql`：按顺序演进真实模型，是结构变更的写入来源。
- `backend/src/db/current-schema.sql`：从空库执行基础 Schema、种子兼容流程和全部迁移后生成的完整只读快照，供阅读、审查和建模。
- `_migrations`：每个数据库实例已经执行的迁移清单。

禁止直接手改 `current-schema.sql`。结构变化应新增迁移，然后重新生成快照：

```bash
pnpm --filter backend schema:snapshot
pnpm --filter backend schema:check
```

## 2. 当前对象分组

| 领域 | 表 |
|---|---|
| 租户与组织 | `enterprises`, `users`, `sessions`, `departments`, `projects` |
| 主数据与交易 | `customers`, `suppliers`, `products`, `orders`, `order_items`, `payments`, `invoices` |
| 协作与内容 | `files`, `library_items`, `tasks`, `approvals`, `conversations`, `messages` |
| Agent 配置 | `agent_personas`, `agent_skills`, `model_providers`, `agent_model_configs`, `ai_tools`, `plugins`, `plugin_configs` |
| 自动化与审计 | `automations`, `automation_runs`, `automation_jobs`, `automation_leases`, `tool_runs`, `audit_logs` |
| 事件与规则 | `business_events`, `business_event_deliveries`, `rules`, `rule_event_runs` |
| 集成与运维 | `integration_runs`, `maintenance_runs`, `_migrations` |
| 历史分析兼容 | `analysis_results`, `business_object_statuses` |

## 3. 逻辑外键

数据库层不创建 `FOREIGN KEY`。以下关系由 Store、路由校验和 Agent 工具执行器维护：

| 子表字段 | 逻辑父表字段 | 删除/变更策略 |
|---|---|---|
| `users.enterprise_id` | `enterprises.id` | 用户不能跨企业访问 |
| `departments.enterprise_id` | `enterprises.id` | 企业内组织隔离 |
| `departments.parent_id` | `departments.id` | 应保持同企业树结构 |
| `projects.enterprise_id` | `enterprises.id` | 项目是业务范围根节点 |
| 各业务表 `enterprise_id` | `enterprises.id` | 所有 API 写入校验企业范围 |
| 各业务表 `project_id` | `projects.id` | 校验项目属于同一企业 |
| `orders.customer_id` | `customers.id` | 客户与订单必须同企业、同项目 |
| `order_items.order_id` | `orders.id` | 订单写入时整体维护 |
| `order_items.product_id` | `products.id` | 商品与订单必须同项目 |
| `payments.order_id` | `orders.id` | 付款与订单必须同项目 |
| `invoices.order_id` | `orders.id` | 发票与订单必须同项目 |
| `invoices.source_file_id` | `files.id` | OCR 确认入库时校验文件范围 |
| `messages.conversation_id` | `conversations.id` | 对话删除由应用层清理 |
| `automation_runs.automation_id` | `automations.id` | 历史运行记录保留 |
| `automation_jobs.automation_id` | `automations.id` | 停用/删除任务执行时再次校验 |
| `business_event_deliveries.event_id` | `business_events.id` | 事件生命周期内保留投递记录 |
| `rule_event_runs.rule_id` | `rules.id` | 用于事件重试幂等 |

## 4. 多副本并发字段

持久任务统一使用以下字段语义：

- `status`：`pending → running → success`，失败进入 `failed` 并重试，耗尽后进入 `dead`。
- `available_at`：下次允许认领时间。
- `lease_owner`：当前工作进程唯一 ID。
- `lease_expires_at`：租约截止时间；过期的 `running` 任务可被接管。
- `attempts` / `max_attempts`：尝试次数与上限。
- `dedupe_key` 或复合主键：阻止同一逻辑时间槽重复创建。

认领操作必须在 SQLite `IMMEDIATE` 短事务内完成，耗时网络调用不得占用数据库事务。

## 5. 快照校验

CI/发布前应执行：

```bash
pnpm --filter backend schema:check
pnpm --filter backend test
```

`schema:check` 会从空数据库重新执行全部迁移，并逐字比较生成结果，以发现基础 Schema、迁移链与快照不一致。
