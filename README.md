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

## Verification

```bash
pnpm --filter backend schema:check
pnpm --filter backend test
pnpm --filter backend build
pnpm --filter frontend test
pnpm --filter frontend build
```
