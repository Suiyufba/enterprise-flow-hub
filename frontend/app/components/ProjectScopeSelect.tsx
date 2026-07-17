"use client";

import type { Enterprise, Project } from "shared";

export function projectName(projects: Project[], projectId: string): string {
  return projects.find((project) => project.id === projectId)?.name ?? "未归属子类";
}

export function enterpriseName(enterprises: Enterprise[], enterpriseId: string): string {
  return enterprises.find((enterprise) => enterprise.id === enterpriseId)?.name ?? "未归属企业";
}

export function EnterpriseScopeSelect({
  enterprises,
  value,
  onChange,
  includeAll = false,
  className = "search-enterprise-select",
  id,
  ariaLabel = "选择所属企业",
  disabled = false,
}: {
  enterprises: Enterprise[];
  value: string;
  onChange: (enterpriseId: string) => void;
  includeAll?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <select id={id} className={className} value={value} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel} disabled={disabled}>
      {includeAll ? <option value="">全部企业</option> : <option value="">选择所属企业</option>}
      {enterprises.map((enterprise) => <option key={enterprise.id} value={enterprise.id}>{enterprise.name}</option>)}
    </select>
  );
}

export function ProjectScopeSelect({
  projects,
  value,
  onChange,
  includeAll = true,
  className = "search-enterprise-select",
  id,
  ariaLabel = "按项目筛选",
}: {
  projects: Project[];
  value: string;
  onChange: (projectId: string) => void;
  includeAll?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  return (
    <select id={id} className={className} value={value} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel}>
      {includeAll ? <option value="">全部子类</option> : <option value="">选择业务子类</option>}
      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
  );
}

export function ProjectBadge({ projects, projectId }: { projects: Project[]; projectId: string }) {
  return <span className="project-scope-badge">{projectName(projects, projectId)}</span>;
}

export function EnterpriseBadge({ enterprises, enterpriseId }: { enterprises: Enterprise[]; enterpriseId: string }) {
  return <span className="project-scope-badge">{enterpriseName(enterprises, enterpriseId)}</span>;
}
