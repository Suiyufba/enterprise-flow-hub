"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";
import { PageHeader } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { gsap, useGSAP } from "../lib/gsap";

type RuleRow = {
  id: string;
  name: string;
  objectType: string;
  triggerEvent: string;
  actionType: string;
  enabled: boolean;
};

export default function RulesPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [data, setData] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(pageRef.current, { y: 24, autoAlpha: 0, duration: 0.5, ease: "power3.out" });
  }, { scope: pageRef });

  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    try {
      const res = await fetchJson<RuleRow[]>(`/rules?enterpriseId=${enterpriseId}`, { adminUserId: user?.id });
      setData(res);
    } catch { showToast("加载失败", "error"); }
    finally { setLoading(false); }
  }, [enterpriseId, user?.id, showToast]);

  useEffect(() => { load(); }, [load]);

  async function toggleRule(id: string) {
    await fetchJson(`/rules/${id}/toggle`, { method: "PATCH", adminUserId: user?.id });
    await load();
  }

  async function deleteRule(id: string) {
    await fetchJson(`/rules/${id}`, { method: "DELETE", adminUserId: user?.id });
    showToast("已删除", "success");
    await load();
  }

  const columns = [
    { key: "name", label: "名称" },
    { key: "objectType", label: "对象类型" },
    { key: "triggerEvent", label: "触发事件" },
    { key: "actionType", label: "动作" },
    {
      key: "enabled",
      label: "状态",
      render: (r: RuleRow) => <StatusBadge status={r.enabled ? "active" : "inactive"} label={r.enabled ? "启用" : "禁用"} />,
    },
    {
      key: "actions",
      label: "操作",
      render: (r: RuleRow) => (
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={() => toggleRule(r.id)}
            style={{ border: "0", borderRadius: "4px", padding: "3px 8px", fontSize: "11px", cursor: "pointer", background: "var(--c-2a2a2a)", color: "var(--c-d4d4d4)" }}
          >
            {r.enabled ? "禁用" : "启用"}
          </button>
          <button
            onClick={() => deleteRule(r.id)}
            style={{ border: "0", borderRadius: "4px", padding: "3px 8px", fontSize: "11px", cursor: "pointer", background: "rgba(255,59,48,0.1)", color: "var(--c-ff3b30)" }}
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell" ref={pageRef}>
        <PageHeader title="规则引擎" description="管理自动化业务规则，当条件满足时触发动作" />
        <DataTable columns={columns} data={data} loading={loading} emptyTitle="暂无规则" emptyDesc="还没有创建任何业务规则" />
      </div>
    </div>
  );
}
