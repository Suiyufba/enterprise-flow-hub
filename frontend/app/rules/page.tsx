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
  description?: string;
  objectType: string;
  triggerEvent: string;
  actionType: string;
  enabled: boolean;
};

const objectTypes = ["customer", "supplier", "product", "order", "file", "project"];
const triggerEvents = ["create", "update", "delete", "status_change"];
const actionTypes = ["notify", "send_email", "call_ai", "api_call", "shell", "update_status"];

export default function RulesPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [data, setData] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objectType, setObjectType] = useState("customer");
  const [triggerEvent, setTriggerEvent] = useState("create");
  const [actionType, setActionType] = useState("notify");
  const [actionConfig, setActionConfig] = useState("");
  const [saving, setSaving] = useState(false);

  async function createRule() {
    if (!name.trim() || !enterpriseId) return;
    setSaving(true);
    try {
      await fetchJson("/rules", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          name: name.trim(),
          description: description.trim() || undefined,
          objectType,
          triggerEvent,
          actionType,
          actionConfig: actionConfig.trim() ? { message: actionConfig.trim() } : undefined,
        }),
        adminUserId: user?.id,
      });
      setName(""); setDescription(""); setActionConfig("");
      setShowForm(false);
      showToast("规则已创建", "success");
      await load();
    } catch { showToast("创建失败", "error"); }
    finally { setSaving(false); }
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
        <PageHeader
          title="规则引擎"
          description="管理自动化业务规则，当条件满足时触发动作"
          actions={
            <button className="page-primary-button" onClick={() => setShowForm(!showForm)} type="button" style={{ border: 0, borderRadius: "10px", fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: "10px 18px", background: "var(--c-f0f0f0)", color: "var(--c-181818)" }}>
              {showForm ? "取消" : "+ 新建规则"}
            </button>
          }
        />

        {showForm && (
          <div className="settings-card" style={{ marginBottom: 14, borderColor: "var(--c-4a90e6)" }}>
            <div className="settings-edit-form">
              <input className="page-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="规则名称 *" />
              <input className="page-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="规则说明（可选）" />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label className="form-label" style={{ fontSize: 12, color: "var(--c-8c8c8c)" }}>对象类型</label>
                  <select className="page-input" value={objectType} onChange={(e) => setObjectType(e.target.value)}>
                    {objectTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: 12, color: "var(--c-8c8c8c)" }}>触发事件</label>
                  <select className="page-input" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)}>
                    {triggerEvents.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 12, color: "var(--c-8c8c8c)" }}>动作类型</label>
                <select className="page-input" value={actionType} onChange={(e) => setActionType(e.target.value)}>
                  {actionTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <input className="page-input" value={actionConfig} onChange={(e) => setActionConfig(e.target.value)} placeholder="动作参数，如通知内容" />

              <button className="page-primary-button" onClick={createRule} disabled={saving || !name.trim()} type="button">
                {saving ? "创建中..." : "确认创建"}
              </button>
            </div>
          </div>
        )}

        <DataTable columns={columns} data={data} loading={loading} emptyTitle="暂无规则" emptyDesc="还没有创建任何业务规则" />
      </div>
    </div>
  );
}
