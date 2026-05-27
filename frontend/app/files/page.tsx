"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { useToast } from "../lib/toast-context";
import { PageHeader } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { gsap, useGSAP } from "../lib/gsap";
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
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const [data, setData] = useState<FileRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(pageRef.current, { y: 24, autoAlpha: 0, duration: 0.5, ease: "power3.out" });
  }, { scope: pageRef });

  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ enterpriseId, page: String(page), limit: "20" });
      const res = await fetchJson<PaginatedList<FileRecord>>(`/files?${params}`, { adminUserId: user?.id });
      setData(res.items);
      setTotal(res.total);
    } catch { showToast("加载失败", "error"); }
    finally { setLoading(false); }
  }, [enterpriseId, page, user?.id, showToast]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("enterpriseId", enterpriseId!);
      const res = await fetch(`${apiUrl}/files/upload`, {
        method: "POST",
        body: form,
        headers: { "x-user-id": user?.id ?? "" },
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("上传成功", "success");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "上传失败", "error");
    } finally {
      setUploading(false);
    }
  }

  const columns = [
    { key: "filename", label: "文件名" },
    { key: "mimeType", label: "类型" },
    { key: "size", label: "大小", render: (f: FileRecord) => formatSize(f.size) },
    { key: "createdAt", label: "上传时间" },
    {
      key: "actions",
      label: "操作",
      render: (f: FileRecord) => (
        <a
          href={`${apiUrl}/files/${f.id}/download`}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--c-4a90e6)", fontSize: "12px", textDecoration: "none" }}
        >
          下载
        </a>
      ),
    },
  ];

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell" ref={pageRef}>
        <PageHeader
          title="文件管理"
          description="上传和管理企业文件"
          actions={
            <button
              className="page-primary-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              type="button"
              style={{ border: 0, borderRadius: "10px", fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: "10px 18px", background: "var(--c-f0f0f0)", color: "var(--c-181818)" }}
            >
              {uploading ? "上传中..." : "+ 上传文件"}
            </button>
          }
        />
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleUpload}
          style={{ display: "none" }}
        />
        <DataTable columns={columns} data={data} loading={loading} total={total} page={page} onPageChange={setPage} emptyTitle="暂无文件" emptyDesc="还没有上传任何文件" />
      </div>
    </div>
  );
}
