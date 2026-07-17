"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";
import { PageHeader } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { AppIcon } from "../components/AppIcon";
import { ConfirmDialog } from "../components/ConfirmDialog";

type RuleRow = {
  id: string;
  name: string;
  description?: string;
  objectType: string;
  triggerEvent: string;
  actionType: string;
  actionConfig: Record<string, unknown>;
  enabled: boolean;
};

const objectTypes = ["customer", "supplier", "product", "order", "payment", "invoice", "file", "project"];
const triggerEvents = ["create", "update", "delete", "status_change"];
const actionTypes = ["notify", "create_task", "set_field", "trigger_automation"];
const tableByObject: Record<string, string> = {
  customer: "customers", order: "orders", payment: "payments", invoice: "invoices",
};
const statusOptionsByObject: Record<string, Array<{ value: string; label: string }>> = {
  customer: [
    { value: "lead", label: "潜在线索" }, { value: "active", label: "活跃客户" },
    { value: "inactive", label: "非活跃" }, { value: "lost", label: "已流失" },
  ],
  order: [
    { value: "draft", label: "草稿" }, { value: "confirmed", label: "已确认" },
    { value: "processing", label: "处理中" }, { value: "shipped", label: "已发货" },
    { value: "delivered", label: "已交付" }, { value: "cancelled", label: "已取消" },
  ],
  payment: [
    { value: "pending", label: "待收款" }, { value: "completed", label: "已到账" },
    { value: "failed", label: "失败" }, { value: "refunded", label: "已退款" },
  ],
  invoice: [
    { value: "draft", label: "草稿" }, { value: "issued", label: "已开具" },
    { value: "paid", label: "已支付" }, { value: "overdue", label: "已逾期" },
    { value: "cancelled", label: "已作废" },
  ],
};

const objectTypeLabels: Record<string, string> = {
  customer: "客户",
  supplier: "供应商",
  product: "商品",
  order: "订单",
  payment: "付款",
  invoice: "发票",
  file: "文件",
  project: "项目",
};

const triggerEventLabels: Record<string, string> = {
  create: "创建时",
  update: "更新时",
  delete: "删除时",
  status_change: "状态变化时",
};

const actionTypeLabels: Record<string, string> = {
  notify: "发送通知",
  create_task: "创建待办",
  set_field: "更新状态字段",
  trigger_approval: "发起审批",
  trigger_automation: "触发自动化",
};

export default function RulesPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [data, setData] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleRow | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<RuleRow | null>(null);
  const [deleting, setDeleting] = useState(false);
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
    try {
      await fetchJson(`/rules/${id}/toggle`, { method: "PATCH", adminUserId: user?.id });
      await load();
    } catch { showToast("规则状态更新失败", "error"); }
  }

  async function deleteRule() {
    if (!ruleToDelete) return;
    setDeleting(true);
    try {
      await fetchJson(`/rules/${ruleToDelete.id}`, { method: "DELETE", adminUserId: user?.id });
      showToast("规则已删除", "success");
      setRuleToDelete(null);
      await load();
    } catch { showToast("规则删除失败", "error"); }
    finally { setDeleting(false); }
  }

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objectType, setObjectType] = useState("customer");
  const [triggerEvent, setTriggerEvent] = useState("create");
  const [actionType, setActionType] = useState("notify");
  const [actionConfig, setActionConfig] = useState("");
  const [saving, setSaving] = useState(false);
  const configuredNotificationPlugins = workspace.plugins.filter((plugin) =>
    ["plugin-feishu", "plugin-wecom"].includes(plugin.id) && plugin.enabled && plugin.configured,
  );
  const enterpriseAutomations = workspace.automations.filter((automation) =>
    workspace.projects.some((project) => project.id === automation.projectId && project.enterpriseId === enterpriseId),
  );

  function resetForm() {
    setName(""); setDescription(""); setObjectType("customer"); setTriggerEvent("create");
    setActionType("notify"); setActionConfig(""); setEditingRule(null);
  }

  function startEdit(rule: RuleRow) {
    setEditingRule(rule);
    setName(rule.name);
    setDescription(rule.description ?? "");
    setObjectType(rule.objectType);
    setTriggerEvent(rule.triggerEvent);
    setActionType(rule.actionType);
    const configValue = rule.actionType === "notify" ? rule.actionConfig.message
      : rule.actionType === "create_task" ? rule.actionConfig.title
        : rule.actionType === "set_field" ? rule.actionConfig.value
          : rule.actionConfig.automationId;
    setActionConfig(typeof configValue === "string" ? configValue : "");
    setShowForm(true);
  }

  async function saveRule() {
    if (!name.trim() || !enterpriseId) return;
    const wasEditing = Boolean(editingRule);
    setSaving(true);
    try {
      if (actionType === "notify" && configuredNotificationPlugins.length === 0) {
        showToast("请先在插件页绑定并启用飞书或企业微信", "error");
        return;
      }
      const config = actionType === "notify"
        ? { message: actionConfig.trim() || `规则「${name.trim()}」已触发`, pluginId: configuredNotificationPlugins[0].id }
        : actionType === "create_task"
          ? { title: actionConfig.trim() || name.trim(), priority: "high" }
          : actionType === "set_field"
            ? { table: tableByObject[objectType], field: "status", value: actionConfig.trim() }
            : { automationId: actionConfig.trim() };
      await fetchJson(editingRule ? `/rules/${editingRule.id}` : "/rules", {
        method: editingRule ? "PATCH" : "POST",
        body: JSON.stringify({
          ...(editingRule ? {} : { enterpriseId }),
          name: name.trim(),
          description: description.trim() || undefined,
          objectType,
          triggerEvent,
          actionType,
          actionConfig: config,
        }),
        adminUserId: user?.id,
      });
      resetForm();
      setShowForm(false);
      showToast(wasEditing ? "规则已更新" : "规则已创建", "success");
      await load();
    } catch { showToast(wasEditing ? "规则保存失败" : "规则创建失败", "error"); }
    finally { setSaving(false); }
  }

  const columns = [
    { key: "name", label: "名称" },
    { key: "objectType", label: "对象类型", render: (r: RuleRow) => objectTypeLabels[r.objectType] ?? r.objectType },
    { key: "triggerEvent", label: "触发事件", render: (r: RuleRow) => triggerEventLabels[r.triggerEvent] ?? r.triggerEvent },
    { key: "actionType", label: "动作", render: (r: RuleRow) => actionTypeLabels[r.actionType] ?? r.actionType },
    {
      key: "enabled",
      label: "状态",
      render: (r: RuleRow) => <StatusBadge status={r.enabled ? "active" : "inactive"} label={r.enabled ? "启用" : "禁用"} />,
    },
    {
      key: "actions",
      label: "操作",
      render: (r: RuleRow) => (
        <div className="table-actions">
          <button className="table-action-button" onClick={() => startEdit(r)} type="button"><AppIcon name="edit" /> 编辑</button>
          <button
            onClick={() => toggleRule(r.id)}
            className="table-action-button"
            type="button"
          >
            {r.enabled ? "禁用" : "启用"}
          </button>
          <button
            onClick={() => setRuleToDelete(r)}
            className="table-action-button danger"
            type="button"
          >
            <AppIcon name="trash" /> 删除
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <PageHeader
          title="规则引擎"
          description="管理自动化业务规则，当条件满足时触发动作"
          actions={
            <button className="page-primary-button" onClick={() => { resetForm(); setShowForm(!showForm); }} type="button" style={{ border: 0, borderRadius: "10px", fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: "10px 18px", background: "var(--c-f0f0f0)", color: "var(--c-181818)" }}>
              {showForm ? <><AppIcon name="x" /> 取消</> : <><AppIcon name="plus" /> 新建规则</>}
            </button>
          }
        />

        {showForm && (
          <div className="settings-card" style={{ marginBottom: 14, borderColor: "var(--c-4a90e6)" }}>
            <div className="settings-edit-form">
              <strong>{editingRule ? "编辑规则" : "新建规则"}</strong>
              <input className="page-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="规则名称 *" />
              <input className="page-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="规则说明（可选）" />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label className="form-label" style={{ fontSize: 12, color: "var(--c-8c8c8c)" }}>对象类型</label>
                  <select className="page-input" value={objectType} onChange={(e) => {
                    setObjectType(e.target.value);
                    if (actionType === "set_field") {
                      setActionConfig("");
                      if (!tableByObject[e.target.value]) setActionType("notify");
                    }
                  }}>
                    {objectTypes.map((t) => <option key={t} value={t}>{objectTypeLabels[t] ?? t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: 12, color: "var(--c-8c8c8c)" }}>触发事件</label>
                  <select className="page-input" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)}>
                    {triggerEvents.map((t) => <option key={t} value={t}>{triggerEventLabels[t] ?? t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 12, color: "var(--c-8c8c8c)" }}>动作类型</label>
                <select className="page-input" value={actionType} onChange={(e) => { setActionType(e.target.value); setActionConfig(""); }}>
                  {actionTypes.filter((type) => type !== "set_field" || Boolean(tableByObject[objectType])).map((t) => <option key={t} value={t}>{actionTypeLabels[t] ?? t}</option>)}
                </select>
              </div>

              {actionType === "trigger_automation" ? (
                <select className="page-input" value={actionConfig} onChange={(e) => setActionConfig(e.target.value)}>
                  <option value="">选择要触发的自动化...</option>
                  {enterpriseAutomations.map((automation) => <option key={automation.id} value={automation.id}>{automation.name}</option>)}
                </select>
              ) : actionType === "set_field" ? (
                <select className="page-input" value={actionConfig} onChange={(e) => setActionConfig(e.target.value)}>
                  <option value="">选择目标状态...</option>
                  {(statusOptionsByObject[objectType] ?? []).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="page-input"
                  value={actionConfig}
                  onChange={(e) => setActionConfig(e.target.value)}
                  placeholder={actionType === "notify" ? "通知内容" : actionType === "create_task" ? "待办标题" : "目标状态值"}
                />
              )}

              {actionType === "notify" && configuredNotificationPlugins.length === 0 && (
                <p className="wf-config-warning">通知规则需要先在插件页绑定并启用飞书或企业微信群机器人。</p>
              )}

              <button className="page-primary-button" onClick={saveRule} disabled={saving || !name.trim() || (["trigger_automation", "set_field"].includes(actionType) && !actionConfig)} type="button">
                {saving ? "保存中..." : editingRule ? "保存修改" : "确认创建"}
              </button>
            </div>
          </div>
        )}

        <DataTable
          className="erp-table-wrap"
          columns={columns}
          data={data}
          loading={loading}
          emptyTitle="暂无规则"
          emptyDesc="规则适合处理确定性的业务约束；复杂跨步骤流程建议放到「自动化」里。"
          emptyAction={<button className="page-primary-button" onClick={() => { resetForm(); setShowForm(true); }} type="button">新建规则</button>}
        />
        <ConfirmDialog open={Boolean(ruleToDelete)} title="删除规则" message={`确定删除规则「${ruleToDelete?.name ?? ""}」吗？删除后将不再触发。`} loading={deleting} onConfirm={deleteRule} onCancel={() => setRuleToDelete(null)} />
      </div>
    </div>
  );
}
