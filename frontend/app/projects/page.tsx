"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWorkspace } from "../lib/workspace-context";
import { SearchInput } from "../components/SearchInput";

export default function ProjectsPage() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [search, setSearch] = useState("");
  const [enterpriseFilter, setEnterpriseFilter] = useState("全部");

  const filtered = useMemo(() => {
    let items = workspace.projects;
    if (enterpriseFilter !== "全部") {
      items = items.filter((p) => p.enterpriseId === enterpriseFilter);
    }
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      items = items.filter((p) => p.name.toLowerCase().includes(kw));
    }
    return items;
  }, [workspace.projects, enterpriseFilter, search]);

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <div className="page-header">
          <h1>项目管理</h1>
          <p>查看和管理所有项目，按企业分组浏览</p>
        </div>

        <div className="lib-top-bar">
          <SearchInput value={search} onChange={setSearch} placeholder="搜索项目名称..." />
          <Link href="/projects/new" className="page-primary-button" style={{ textDecoration: "none", padding: "10px 18px", fontSize: "14px" }}>
            + 新建项目
          </Link>
        </div>

        <div className="search-filters" style={{ marginBottom: 16 }}>
          <div className="search-filter-chips">
            <button
              className={`search-chip ${enterpriseFilter === "全部" ? "active" : ""}`}
              onClick={() => setEnterpriseFilter("全部")}
              type="button"
            >
              全部企业
            </button>
            {workspace.enterprises.map((ent) => (
              <button
                key={ent.id}
                className={`search-chip ${enterpriseFilter === ent.id ? "active" : ""}`}
                onClick={() => setEnterpriseFilter(ent.id)}
                type="button"
              >
                {ent.name}
              </button>
            ))}
          </div>
        </div>

        <div className="page-list">
          {filtered.length === 0 && (
            <div className="search-empty">暂无项目</div>
          )}
          {filtered.map((project) => {
            const ent = workspace.enterprises.find((e) => e.id === project.enterpriseId);
            const convCount = workspace.conversations.filter((c) => c.projectId === project.id).length;
            const libCount = workspace.libraryItems.filter((l) => l.projectId === project.id).length;
            return (
              <div
                key={project.id}
                className="page-row search-result"
                onClick={() => router.push(`/projects/${project.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") router.push(`/projects/${project.id}`); }}
              >
                <div className="search-result-header">
                  {ent && <span className="search-enterprise-badge">{ent.name}</span>}
                  <span className="search-type-badge search-type-项目">项目</span>
                </div>
                <strong>{project.name}</strong>
                {project.description && <p>{project.description}</p>}
                <div style={{ fontSize: 12, color: "var(--c-8c8c8c)", marginTop: 4 }}>
                  {convCount} 对话 · {libCount} 资料
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
