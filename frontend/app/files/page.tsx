"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";
import { PageHeader } from "../components/PageHeader";
import { ErrorState } from "../components/ErrorState";
import { DataTable } from "../components/DataTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { AppIcon } from "../components/AppIcon";
import { EnterpriseBadge, EnterpriseScopeSelect, ProjectBadge, ProjectScopeSelect } from "../components/ProjectScopeSelect";
import type { FileRecord, PaginatedList } from "shared";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const [enterpriseFilter, setEnterpriseFilter] = useState("");
  const enterprises = user?.role === "admin" ? workspace.enterprises : workspace.enterprises.filter((enterprise) => enterprise.id === user?.enterpriseId);
  const enterpriseId = enterpriseFilter || user?.enterpriseId || enterprises[0]?.id;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const [data, setData] = useState<FileRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const projectOptions = workspace.projects.filter((project) => project.enterpriseId === enterpriseId);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [fileToDelete, setFileToDelete] = useState<FileRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!enterpriseFilter && user?.enterpriseId) setEnterpriseFilter(user.enterpriseId); }, [enterpriseFilter, user?.enterpriseId]);

  useEffect(() => {
    if (!selectedProjectId && projectOptions[0]) setSelectedProjectId(projectOptions[0].id);
  }, [projectOptions, selectedProjectId]);
  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ enterpriseId, page: String(page), limit: "20" });
      if (projectFilter) params.set("projectId", projectFilter);
      const res = await fetchJson<PaginatedList<FileRecord>>(`/files?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch { showToast("加载失败", "error"); setError("加载失败，请检查网络后重试"); }
    finally { setLoading(false); }
  }, [enterpriseId, page, projectFilter, user?.id, showToast]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedProjectId) {
      showToast("请先选择文件所属项目", "error");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("relatedType", "project");
      form.append("relatedId", selectedProjectId);
      form.append("file", file);
      const headers: Record<string, string> = {};
      const storedToken = typeof window !== "undefined" ? localStorage.getItem("efh_token") : null;
      if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
      const res = await fetch(`${apiUrl}/files/upload`, {
        method: "POST",
        body: form,
        headers,
      });
      if (!res.ok) { showToast("上传失败", "error"); return; }
      showToast("上传成功", "success");
      await load();
    } catch {
      showToast("上传失败", "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDownload(fileId: string, filename: string) {
    try {
      const headers: Record<string, string> = {};
      const storedToken = typeof window !== "undefined" ? localStorage.getItem("efh_token") : null;
      if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
      const res = await fetch(`${apiUrl}/files/${fileId}/download`, { headers });
      if (!res.ok) { showToast("下载失败", "error"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("下载失败", "error");
    }
  }

  async function handleDelete() {
    if (!fileToDelete) return;
    setDeleting(true);
    try {
      await fetchJson(`/files/${fileToDelete.id}`, { method: "DELETE", adminUserId: user?.id });
      showToast("文件已删除", "success");
      setFileToDelete(null);
      await load();
    } catch { showToast("文件删除失败", "error"); }
    finally { setDeleting(false); }
  }

  const columns = [
    { key: "filename", label: "文件名" },
    { key: "mimeType", label: "类型" },
    { key: "size", label: "大小", render: (f: FileRecord) => formatSize(f.size) },
    { key: "enterpriseId", label: "所属企业", render: (f: FileRecord) => <EnterpriseBadge enterprises={workspace.enterprises} enterpriseId={f.enterpriseId} /> },
    { key: "projectId", label: "业务子类", render: (f: FileRecord) => <ProjectBadge projects={workspace.projects} projectId={f.projectId} /> },
    { key: "createdAt", label: "上传时间", render: (f: FileRecord) => f.createdAt.slice(0, 10) },
    {
      key: "actions",
      label: "操作",
      render: (f: FileRecord) => (
        <div className="table-actions">
          <button className="table-action-button" onClick={() => handleDownload(f.id, f.filename)} type="button"><AppIcon name="download" /> 下载</button>
          <button className="table-action-button danger" onClick={() => setFileToDelete(f)} type="button"><AppIcon name="trash" /> 删除</button>
        </div>
      ),
    },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <PageHeader
          title="文件管理"
          description="上传和管理企业文件"
          actions={<div className="page-header-controls">
            <EnterpriseScopeSelect enterprises={enterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setSelectedProjectId(""); setProjectFilter(""); }} className="page-input compact-select" ariaLabel="文件所属企业" />
            <ProjectScopeSelect projects={projectOptions} value={selectedProjectId} onChange={setSelectedProjectId} includeAll={false} className="page-input compact-select" ariaLabel="文件业务子类" />
            <button className="page-primary-button" onClick={() => fileInputRef.current?.click()} disabled={uploading || !selectedProjectId} type="button">
              {uploading ? "上传中..." : "上传文件"}
            </button>
          </div>}
        />
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleUpload}
          style={{ display: "none" }}
        />
        <div className="page-toolbar" style={{ marginBottom: 14 }}>
          <EnterpriseScopeSelect enterprises={enterprises} value={enterpriseId ?? ""} onChange={(value) => { setEnterpriseFilter(value); setSelectedProjectId(""); setProjectFilter(""); setPage(1); }} ariaLabel="按所属企业筛选" />
          <ProjectScopeSelect projects={projectOptions} value={projectFilter} onChange={(value) => { setProjectFilter(value); setPage(1); }} />
        </div>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <DataTable
            className="erp-table-wrap"
            columns={columns}
            data={data}
            loading={loading}
            total={total}
            page={page}
            onPageChange={setPage}
            emptyTitle="暂无文件"
            emptyDesc="上传合同、截图、表格或发票附件后，Agent 才能在对话和工作流里引用这些文件。"
            emptyAction={<button className="page-primary-button" onClick={() => fileInputRef.current?.click()} disabled={!selectedProjectId} type="button">上传文件</button>}
          />
        )}
        <ConfirmDialog open={Boolean(fileToDelete)} title="删除文件" message={`确定删除「${fileToDelete?.filename ?? ""}」吗？Agent 和自动化将无法再使用此文件。`} loading={deleting} onConfirm={handleDelete} onCancel={() => setFileToDelete(null)} />
      </div>
    </div>
  );
}
