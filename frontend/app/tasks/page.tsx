"use client";

import { useCallback, useEffect, useState } from "react";
import type { PaginatedList, Task } from "shared";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { AppIcon } from "../components/AppIcon";
import { FormDialog } from "../components/FormDialog";
import { EnterpriseBadge, EnterpriseScopeSelect, ProjectBadge, ProjectScopeSelect } from "../components/ProjectScopeSelect";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../lib/toast-context";
import { useWorkspace } from "../lib/workspace-context";

const priorityLabel: Record<Task["priority"], string> = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

export default function TasksPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const enterprises = user?.role === "admin" ? workspace.enterprises : workspace.enterprises.filter((enterprise) => enterprise.id === user?.enterpriseId);
  const enterpriseId = enterpriseFilter || user?.enterpriseId || enterprises[0]?.id;
  const projects = workspace.projects.filter((project) => project.enterpriseId === enterpriseId);
  const [items, setItems] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("open");
  const [projectFilter, setProjectFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ projectId: "", title: "", description: "", priority: "medium" as Task["priority"], dueDate: "" });

  useEffect(() => { if (!enterpriseFilter && user?.enterpriseId) setEnterpriseFilter(user.enterpriseId); }, [enterpriseFilter, user?.enterpriseId]);

  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    try {
      const query = new URLSearchParams({ enterpriseId, page: String(page), limit: "20" });
      if (status !== "all") query.set("status", status);
      if (projectFilter) query.set("projectId", projectFilter);
      const response = await fetchJson<PaginatedList<Task>>(`/tasks?${query}`);
      setItems(response.items);
      setTotal(response.total);
    } catch {
      showToast("待办加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, page, projectFilter, showToast, status]);

  useEffect(() => { void load(); }, [load]);

  async function changeStatus(task: Task, nextStatus: Task["status"]) {
    try {
      await fetchJson(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      showToast(nextStatus === "completed" ? "待办已完成" : "待办已更新", "success");
      await load();
    } catch {
      showToast("待办更新失败", "error");
    }
  }

  function openCreate() {
    setEditingTask(null);
    setForm({ projectId: projectFilter || projects[0]?.id || "", title: "", description: "", priority: "medium", dueDate: "" });
    setShowForm(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setForm({
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate?.slice(0, 10) ?? "",
    });
    setShowForm(true);
  }

  async function saveTask() {
    if (!enterpriseId || !form.projectId || !form.title.trim()) return;
    setSaving(true);
    try {
      await fetchJson(editingTask ? `/tasks/${editingTask.id}` : "/tasks", {
        method: editingTask ? "PATCH" : "POST",
        body: JSON.stringify({
          ...(editingTask ? {} : { enterpriseId }),
          projectId: form.projectId,
          title: form.title.trim(),
          description: form.description.trim(),
          priority: form.priority,
          dueDate: form.dueDate ? new Date(`${form.dueDate}T23:59:59`).toISOString() : null,
        }),
      });
      showToast(editingTask ? "待办已更新" : "待办已创建", "success");
      setShowForm(false);
      await load();
    } catch { showToast(editingTask ? "待办保存失败" : "待办创建失败", "error"); }
    finally { setSaving(false); }
  }

  const columns = [
    {
      key: "title",
      label: "待办",
      render: (task: Task) => <div><strong>{task.title}</strong>{task.description && <div className="table-secondary-text">{task.description}</div>}</div>,
    },
    { key: "enterpriseId", label: "所属企业", render: (task: Task) => <EnterpriseBadge enterprises={workspace.enterprises} enterpriseId={task.enterpriseId} /> },
    { key: "projectId", label: "业务子类", render: (task: Task) => <ProjectBadge projects={workspace.projects} projectId={task.projectId} /> },
    { key: "priority", label: "优先级", render: (task: Task) => priorityLabel[task.priority] },
    { key: "dueDate", label: "截止时间", render: (task: Task) => task.dueDate?.slice(0, 10) || "未设置" },
    { key: "sourceType", label: "来源", render: (task: Task) => task.sourceType || "手动" },
    { key: "status", label: "状态", render: (task: Task) => <StatusBadge status={task.status} /> },
    {
      key: "actions",
      label: "操作",
      render: (task: Task) => (
        <div className="table-actions">
          <button className="table-action-button" onClick={() => openEdit(task)} type="button"><AppIcon name="edit" /> 编辑</button>
          {task.status === "pending" && <button className="page-secondary-button compact" onClick={() => changeStatus(task, "in_progress")} type="button">开始</button>}
          {["pending", "in_progress"].includes(task.status) && <button className="page-secondary-button compact" onClick={() => changeStatus(task, "completed")} type="button">完成</button>}
          {["completed", "cancelled"].includes(task.status) && <button className="page-secondary-button compact" onClick={() => changeStatus(task, "pending")} type="button">重新打开</button>}
          {!["completed", "cancelled"].includes(task.status) && <button className="page-secondary-button compact" onClick={() => changeStatus(task, "cancelled")} type="button">取消</button>}
        </div>
      ),
    },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: 40 }}>
      <div className="page-shell">
        <PageHeader title="待办中心" description="承接手动、Agent、规则和自动化产生的业务动作。" actions={(
          <div className="page-header-controls">
            <EnterpriseScopeSelect enterprises={enterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setProjectFilter(""); setPage(1); }} className="page-input compact-select" ariaLabel="按所属企业筛选" />
            <ProjectScopeSelect projects={projects} value={projectFilter} onChange={(value) => { setProjectFilter(value); setPage(1); }} className="page-input compact-select" />
            <select className="page-input compact-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="open">未完成</option>
              <option value="all">全部</option>
              <option value="pending">待处理</option>
              <option value="in_progress">处理中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
            <button className="page-primary-button" onClick={openCreate} type="button"><AppIcon name="plus" /> 新建待办</button>
          </div>
        )} />
        <DataTable columns={columns} data={items} loading={loading} total={total} page={page} onPageChange={setPage} emptyTitle="没有待处理任务" emptyDesc="可以手动创建待办，Agent、规则和自动化产生的业务动作也会出现在这里。" emptyAction={<button className="page-primary-button" onClick={openCreate} type="button">新建待办</button>} />
        <FormDialog open={showForm} title={editingTask ? `编辑待办：${editingTask.title}` : "新建待办"} saving={saving} submitLabel={editingTask ? "保存修改" : "创建待办"} submitDisabled={!form.projectId || !form.title.trim()} onSubmit={saveTask} onCancel={() => setShowForm(false)}>
          <label className="form-label" htmlFor="task-enterprise">所属企业 *</label>
          <EnterpriseScopeSelect id="task-enterprise" enterprises={enterprises} value={editingTask?.enterpriseId ?? enterpriseId ?? ""} onChange={(value) => { if (!editingTask) { setEnterpriseFilter(value); setForm((current) => ({ ...current, projectId: "" })); } }} className="page-input" ariaLabel="待办所属企业" disabled={Boolean(editingTask)} />
          <label className="form-label" htmlFor="task-project">业务子类 *</label>
          <ProjectScopeSelect id="task-project" projects={editingTask ? workspace.projects.filter((project) => project.enterpriseId === editingTask.enterpriseId) : projects} value={form.projectId} onChange={(projectId) => setForm((current) => ({ ...current, projectId }))} includeAll={false} className="page-input" ariaLabel="待办业务子类" />
          <label className="form-label" htmlFor="task-title">待办标题 *</label>
          <input id="task-title" className="page-input" autoFocus value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          <label className="form-label" htmlFor="task-description">说明</label>
          <textarea id="task-description" className="page-textarea" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          <label className="form-label" htmlFor="task-priority">优先级</label>
          <select id="task-priority" className="page-input" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as Task["priority"] }))}>
            <option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="urgent">紧急</option>
          </select>
          <label className="form-label" htmlFor="task-due-date">截止日期</label>
          <input id="task-due-date" className="page-input" type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
        </FormDialog>
      </div>
    </div>
  );
}
