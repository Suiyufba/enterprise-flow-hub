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
      // Use the existing fetchJson approach — audit_logs query via a simple GET
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
    { key: "action", label: "操作" },
    { key: "object_type", label: "对象类型" },
    { key: "object_id", label: "对象ID", render: (r: AuditLogRow) => <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{r.object_id?.slice(0, 16)}</span> },
    { key: "created_at", label: "时间" },
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
