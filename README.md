# Enterprise Flow Hub

Enterprise Flow Hub 是面向企业业务操作的 Agent 工作台。用户在明确的企业和项目范围内，通过对话查询、分析并更新客户、供应商、商品、订单、付款、发票、文件和待办；系统同时提供模型配置、技能、人设、资料库、插件、规则引擎和可视化自动化。

## Structure

- `frontend/`：Next.js 企业工作台与对话界面
- `backend/`：Fastify API、Agent 编排、MCP 工具、持久化任务和事件执行器
- `shared/`：前后端共享的 Zod Schema 与类型
- `docs/`：当前架构、领域模型、数据库和历史产品决策
- `deploy/`：Docker Compose 生产部署配置

## Current Architecture

- 三层意图识别：Rule + Embedding + LLM，加权投票后路由 Tool 或 Planner
- Agent 执行：Planner → Executor → MCP，失败进入 Replanner
- 业务隔离：Enterprise 租户边界 + Project 业务范围
- 模型配置：Think、Executor、Embedding 独立账户组合
- 可靠执行：数据库持久任务、去重键、跨进程租约、心跳、指数退避与崩溃恢复
- 事件机制：持久化业务事件、逐处理器投递和规则幂等记录

详细说明：

- [当前架构与领域模型](docs/current-architecture.md)
- [当前数据库 Schema](docs/current-schema.md)
- [API 文档](docs/api.md)
- [历史截图诊断 MVP 方案](docs/plan.md)
- [PostgreSQL 迁移评估](docs/postgresql-migration-assessment.md)

## Deployment Boundary（部署边界）

当前生产部署为**单机 Docker Compose + 共享 SQLite WAL 数据卷 + Nginx**。多后端副本共享同一 SQLite 数据库在单机本地磁盘上是安全的（应用层通过 IMMEDIATE 短事务、持久化租约、心跳与去重键协调竞争）。

服务器通过 `enterprise-flow-hub-docker-cleanup.timer` 每周清理 Docker 资源：每个当前运行仓库只保留最新 2 个发布版本（当前版和回滚版），同时清理超过 7 天的其他未使用镜像和构建缓存。任务以最低 CPU/IO 优先级运行，不清理业务数据卷，并通过 `Persistent=true` 在服务器错过执行时间后补跑。

**不要**把 SQLite 数据文件放到不保证 POSIX 锁语义的普通网络文件系统（NFS/SMB 等），**不要**跨多台物理机共享同一个 SQLite 文件。出现以下任一信号时，按 [PostgreSQL 迁移评估](docs/postgresql-migration-assessment.md) 启动迁移：

1. 需要将后端副本部署到不同物理机；
2. 单库预计超过 ~20GB 或持续写入 QPS > 500；
3. 客户要求使用托管数据库。

## Roadmap（当前计划）

| 优先级 | 事项 | 状态 |
| --- | --- | --- |
| P0 | 仓库卫生：忽略生成产物（.playwright-cli/output/tmp/screenshots），提交积压改动 | ✅ 已完成 |
| P0 | CI 质量关卡：lint + 后端测试 + schema:check + 前后端构建（ci.yml，deploy 前置 checks） | ✅ 已完成 |
| P0 | 前端最小测试套件（api / workspace-context / workflow-graph，vitest + Testing Library） | ✅ 已完成 |
| P0 | 后端持久化并发测试（租约接管、任务去重、重试至 dead、事件投递至 dead） | ✅ 已完成 |
| P1 | 修复测试暴露的 runTool 非字符串输出崩溃问题 | ✅ 已完成 |
| P2 | 前端核心交互测试（WorkflowEditor 渲染交互、SSE 聊天流、Auth 状态机） | ✅ 已完成（前端共 39 tests） |
| P2 | PostgreSQL 迁移（见评估文档；仅在触发信号出现时启动） | ⏳ 待触发 |
| P3 | E2E 冒烟测试（Playwright：登录 → 对话 → 自动化保存主链路，本地 stub LLM 无外部依赖） | ✅ 已完成（`pnpm test:e2e`） |
| P3 | 聊天消息组件与 Markdown 渲染测试 | ✅ 已完成（前端共 43 tests） |
| P4 | 自动化触发 E2E（webhook 密钥校验与触发落库、定时任务调度入队与执行落库） | ✅ 已完成（E2E 共 5 tests） |

## Verification

```bash
pnpm --filter backend schema:check
pnpm --filter backend test
pnpm --filter backend build
pnpm --filter frontend test
pnpm --filter frontend build
```
