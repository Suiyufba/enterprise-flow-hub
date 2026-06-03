"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";
import { PageHeader } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";

type AuditLogRow = {
  id: string;
  action: string;
  object_type: string;
  object_id?: string | null;
  created_at: string;
};

// 对象类型中文名
const objectLabels: Record<string, string> = {
  users: "用户",
  departments: "部门",
  customers: "客户",
  orders: "订单",
  products: "商品",
  suppliers: "供应商",
  payments: "付款",
  invoices: "发票",
  conversations: "对话",
  automations: "自动化",
  skills: "技能",
  personas: "角色",
  auth: "认证",
  library: "资料",
  files: "文件",
  rules: "规则",
  settings: "设置",
  enterprises: "企业",
  projects: "项目",
  providers: "模型",
  workbench: "工作台",
  messages: "消息",
};

// 操作动词
const methodLabels: Record<string, string> = {
  POST: "创建",
  PUT: "更新",
  PATCH: "修改",
  DELETE: "删除",
};

function parseAction(action: string): string {
  const [method, ...pathParts] = action.split(" ");
  const path = pathParts.join(" ");
  if (!method || !path) return action;

  const verb = methodLabels[method] || method;
  const segments = path.split("/").filter(Boolean);

  // POST /automations/xxx/run → "运行自动化"
  if (segments.length >= 3 && segments[0] === "automations" && segments[2] === "run") {
    return "运行自动化";
  }
  // POST /conversations/xxx/messages → "发送消息"
  if (segments.length >= 3 && segments[0] === "conversations" && segments[2] === "messages") {
    return "发送消息";
  }

  const objType = objectLabels[segments[0]] || segments[0];
  const hasId = segments.length >= 2 && segments[1].length > 0;

  // POST /users → "创建用户"
  if (!hasId) return `${verb}${objType}`;

  // POST /auth/login → "用户登录"
  if (segments[0] === "auth" && segments[1] === "login") return "用户登录";

  // GET /xxx/yyy → "查看xxx详情" — skip GET anyway, but just in case
  if (method === "GET") return `查看${objType}详情`;

  // PATCH /users/xxx → "修改用户"
  // DELETE /users/xxx → "删除用户"
  // POST /xxx/yyy → "创建xxx" (nested)
  return `${verb}${objType}`;
}

export default function AuditPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [data, setData] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    try {
      const res = await fetchJson<{ items: AuditLogRow[]; total: number }>(`/audit?enterpriseId=${enterpriseId}&page=${page}&limit=50`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch {
      showToast("加载审计日志失败", "error");
    }
    finally { setLoading(false); }
  }, [enterpriseId, page, user?.id, showToast]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    {
      key: "action",
      label: "操作",
      render: (r: AuditLogRow) => (
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {parseAction(r.action)}
        </span>
      ),
    },
    {
      key: "object_type",
      label: "对象",
      render: (r: AuditLogRow) => (
        <span style={{ fontSize: 12, color: "var(--c-8c8c8c)" }}>
          {objectLabels[r.object_type] || r.object_type}
        </span>
      ),
    },
    {
      key: "created_at",
      label: "时间",
      render: (r: AuditLogRow) => {
        try {
          return new Date(r.created_at).toLocaleString("zh-CN", { hour12: false });
        } catch {
          return r.created_at;
        }
      },
    },
  ];

  if (!user || user.role !== "admin") {
    return (
      <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
        <div className="page-shell">
          <PageHeader title="操作日志" description="仅管理员可查看" />
          <p style={{ color: "var(--c-8c8c8c)", textAlign: "center", padding: "48px" }}>需要管理员权限</p>
        </div>
      </div>
    );
  }

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <PageHeader title="操作日志" description="记录所有写入操作，满足审计合规要求" />
        <DataTable columns={columns} data={data} loading={loading} total={total} page={page} onPageChange={setPage} emptyTitle="暂无日志" emptyDesc="尚未有操作记录" />
      </div>
    </div>
  );
}
