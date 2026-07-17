"use client";

import type { Project } from "shared";

export function projectName(projects: Project[], projectId: string): string {
  return projects.find((project) => project.id === projectId)?.name ?? "未归属项目";
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
      {includeAll ? <option value="">全部项目</option> : <option value="">选择所属项目</option>}
      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
  );
}

export function ProjectBadge({ projects, projectId }: { projects: Project[]; projectId: string }) {
  return <span className="project-scope-badge">{projectName(projects, projectId)}</span>;
}
