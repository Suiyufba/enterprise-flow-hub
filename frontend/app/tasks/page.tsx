"use client";

import { useCallback, useEffect, useState } from "react";
import type { PaginatedList, Task } from "shared";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../lib/toast-context";

const priorityLabel: Record<Task["priority"], string> = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

export default function TasksPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("open");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.enterpriseId) return;
    setLoading(true);
    try {
      const query = new URLSearchParams({ enterpriseId: user.enterpriseId, page: String(page), limit: "20" });
      if (status !== "all") query.set("status", status);
      const response = await fetchJson<PaginatedList<Task>>(`/tasks?${query}`);
      setItems(response.items);
      setTotal(response.total);
    } catch {
      showToast("待办加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [page, showToast, status, user?.enterpriseId]);

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

  const columns = [
    { key: "title", label: "待办" },
    { key: "priority", label: "优先级", render: (task: Task) => priorityLabel[task.priority] },
    { key: "dueDate", label: "截止时间", render: (task: Task) => task.dueDate?.slice(0, 10) || "未设置" },
    { key: "sourceType", label: "来源", render: (task: Task) => task.sourceType || "手动" },
    { key: "status", label: "状态", render: (task: Task) => <StatusBadge status={task.status} /> },
    {
      key: "actions",
      label: "操作",
      render: (task: Task) => (
        <div className="table-actions">
          {task.status === "pending" && <button className="page-secondary-button compact" onClick={() => changeStatus(task, "in_progress")} type="button">开始</button>}
          {task.status !== "completed" && <button className="page-secondary-button compact" onClick={() => changeStatus(task, "completed")} type="button">完成</button>}
        </div>
      ),
    },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: 40 }}>
      <div className="page-shell">
        <PageHeader title="待办中心" description="承接 Agent、规则和自动化产生的业务动作。" actions={(
          <select className="page-input compact-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="open">未完成</option>
            <option value="all">全部</option>
            <option value="pending">待处理</option>
            <option value="in_progress">处理中</option>
            <option value="completed">已完成</option>
          </select>
        )} />
        <DataTable columns={columns} data={items} loading={loading} total={total} page={page} onPageChange={setPage} emptyTitle="没有待处理任务" emptyDesc="Agent 或规则创建的待办会出现在这里。" />
      </div>
    </div>
  );
}
