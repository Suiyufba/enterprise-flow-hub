# PostgreSQL 迁移评估（2026-07）

> 目的：评估 Enterprise Flow Hub 从 SQLite 迁移到 PostgreSQL 的必要性、影响面与执行路径。
> 结论先行：**单机 Docker Compose 部署继续使用 SQLite WAL 是合理边界；只有在「跨主机多副本」或「单库数据量 / 写入并发明显增长」时才需要迁移。** 迁移应在明确触发条件出现时启动，而不是提前重写。

## 1. 为什么现在可以继续用 SQLite

| 维度 | 现状 | 评估 |
| --- | --- | --- |
| 部署形态 | 单机 Docker Compose，数据卷本地磁盘 | SQLite WAL 在本地 POSIX 磁盘上语义正确 |
| 写入并发 | 多副本靠 IMMEDIATE 短事务 + 租约协调 | SQLite 单写者模型恰好与租约设计匹配 |
| 数据量 | 中小企业业务数据，单库预计 < 10GB | SQLite 在该量级完全胜任 |
| 运维 | 单文件备份（backup-db.sh 直接复制） | 比 PostgreSQL 备份更简单 |
| 团队 | 单人开发维护 | 少一个基础设施组件 = 少一类故障 |

当前架构中所有「多副本竞争」问题（自动化租约、事件投递、集成重试、维护任务）都是**应用层用数据库事务解决的**，SQLite 的串行写入反而让这些语义简单可验证——迁移到 PostgreSQL 后这套设计可以直接保留，事务语句基本不变。

## 2. 触发迁移的信号（出现任一即启动评估）

1. 需要部署 ≥ 2 个后端副本到**不同物理机**（共享卷不再是本地磁盘）。
2. 单库预计超过 ~20GB，或写入 QPS 持续 > 500。
3. 客户要求使用托管数据库（云 RDS / 企业数据库规范）。
4. 需要 PostgreSQL 专有能力：行级安全（RLS）、逻辑复制、全文检索、JSONB 索引。

## 3. 影响面分析

### 3.1 数据库访问层（工作量：中）

- `backend/src/db/index.ts` 是唯一初始化入口：schema.sql + 顺序迁移 + seed.sql。
- 迁移方案：引入迁移框架（如 `node-pg-migrate`）或沿用「按文件名排序的 SQL 迁移」惯例，把 `_migrations` 表换成 PostgreSQL 版本表。
- `better-sqlite3` 的同步 API 与 `db.prepare(...).run/get/all` 模式需要换成 `pg` 异步池；**建议先做一层薄 DAO 接口**，让 store 层不直接依赖 driver。

### 3.2 SQL 方言差异（工作量：低-中，逐个核对）

| 差异点 | SQLite | PostgreSQL | 影响 |
| --- | --- | --- | --- |
| 布尔 | INTEGER 0/1 | BOOLEAN | 全部 CHECK / 比较语句要过一遍 |
| 时间 | TEXT ISO 字符串 | TIMESTAMPTZ | 所有 created_at/available_at 比较 |
| 自增 ID | TEXT + 应用 UUID | 可沿用 TEXT UUID | 无需改 |
| 外键 | 已刻意移除 | 可启用（加分项） | 迁移时可顺带恢复 |
| upsert | `INSERT OR IGNORE/REPLACE` | `ON CONFLICT DO NOTHING/UPDATE` | 自动化去重、事件投递大量使用 |
| 事务 | `db.transaction(fn).immediate()` | `BEGIN IMMEDIATE` 语义不同（靠行锁/咨询锁） | **租约竞争语义需要重新验证** |
| JSON | TEXT | JSONB（更好） | 业务 payload 可升级 |

### 3.3 租约与调度语义（工作量：高，重点验证区）

- 当前依赖 SQLite 的「单写者 + IMMEDIATE 事务」保证 `claimAutomationJob` / `claimDelivery` 的原子性。
- PostgreSQL 下同一逻辑靠 `SELECT ... FOR UPDATE SKIP LOCKED` 或 `UPDATE ... WHERE status=...` 行锁实现，**语义等价但必须重写查询并做并发测试**。
- 现有 `backend/test/durability.test.ts` 的 4 个用例（租约互斥/接管、任务去重、重试至 dead、事件投递至 dead）正好可以作为迁移后的验收套件——这是迁移前就写并发测试的最大价值。

### 3.4 部署与运维（工作量：中）

- `deploy/docker-compose.yml` 增加 postgres 服务与健康检查、初始化脚本。
- `backup-db.sh` 换成 `pg_dump`；恢复流程要写文档。
- 上传文件仍走共享卷/对象存储，与数据库解耦，不受影响。

## 4. 分阶段执行路径（建议）

```mermaid
flowchart LR
  A["阶段0: DAO 抽象层<br/>(store 不直接依赖 driver)"] --> B["阶段1: 双跑模式<br/>(SQLite 继续生产, PG 影子库跑测试)"]
  B --> C["阶段2: 并发验收<br/>(durability 套件在 PG 上全绿)"]
  C --> D["阶段3: 切换<br/>(数据迁移脚本 + 回滚预案)"]
```

1. **阶段 0（1-2 周）**：把 `backend/src/store*.ts` 中对 better-sqlite3 的调用收敛到 `db/index.ts` 暴露的薄接口；不改行为，只改结构。期间可顺手修正迁移编号重复（003/004 各两个）的问题——用版本表 + 一次性重编号，避免迁移到 PG 时把历史包袱带过去。
2. **阶段 1（1-2 周）**：引入 `pg` 驱动 + 影子数据库；CI 中同一套测试分别在 SQLite 与 PostgreSQL 上跑。
3. **阶段 2（1 周）**：把 durability 测试扩成「并发压力版」（多 worker 同时 drain），在 PG 上验证 `SKIP LOCKED` 语义；补齐数据迁移脚本（含 seed 数据）。
4. **阶段 3（1-2 天）**：生产切换窗口：停写 → 全量迁移 → 校验行数/抽样 → 切流量 → 观察租约/事件健康度 → 保留 SQLite 文件一周作为回滚源。

## 5. 不迁移的替代方案（先考虑）

- **保持单机 + 双副本**：SQLite WAL 共享卷在单机内是安全的；明确「一个 Docker 主机 = 一个部署单元」即可。
- **纵向扩展**：单机加内存/磁盘，比引入 PG 便宜得多。
- **对象存储 + SQLite**：文件已走独立卷，后续可单独把上传目录迁到对象存储（如 S3/MinIO），收益比迁 PG 更直接。

## 6. 决策记录

- 2026-07：维持 SQLite WAL，写入 README 部署边界；不设迁移时间表，只设触发信号。
- 下次评审条件：出现第 2 节任一信号，或 durability 套件在 SQLite 上出现难以解释的锁等待。
