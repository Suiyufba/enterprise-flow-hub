import { getDb } from "../../db/index.js";
import { buildProjectContext, getProject } from "../../store.js";

type LibraryContextItem = {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  type: string;
  summary: string;
  visibility: string;
  scope: "current_project" | "enterprise_public";
  createdAt: string;
};

function buildLibrarySearch(enterpriseId: string, projectId: string, query: string): LibraryContextItem[] {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filters = [
    "item.enterprise_id = ?",
    "(item.project_id = ? OR item.visibility = 'public')",
  ];
  const params: unknown[] = [enterpriseId, projectId];

  if (terms.length) {
    filters.push(`(${terms.map(() => "(LOWER(item.name) LIKE ? OR LOWER(item.summary) LIKE ?)").join(" OR ")})`);
    for (const term of terms) {
      const match = `%${term}%`;
      params.push(match, match);
    }
  }

  const rows = getDb()
    .prepare(
      `SELECT item.id, item.project_id, project.name AS project_name, item.name, item.type, item.summary,
              item.visibility, item.created_at,
              CASE WHEN item.project_id = ? THEN 0 ELSE 1 END AS scope_priority
       FROM library_items item
       JOIN projects project ON project.id = item.project_id
       WHERE ${filters.join(" AND ")}
       ORDER BY scope_priority ASC, item.created_at DESC`,
    )
    .all(projectId, ...params) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as string,
    projectId: row.project_id as string,
    projectName: row.project_name as string,
    name: row.name as string,
    type: row.type as string,
    summary: row.summary as string,
    visibility: row.visibility as string,
    scope: row.project_id === projectId ? "current_project" : "enterprise_public",
    createdAt: row.created_at as string,
  }));
}

export async function companyContextExecute(input: Record<string, unknown>): Promise<string> {
  const enterpriseId = typeof input._enterpriseId === "string" ? input._enterpriseId : "";
  const projectId = typeof input._projectId === "string" ? input._projectId : "";
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const project = getProject(projectId);

  if (!enterpriseId || !project || project.enterpriseId !== enterpriseId) {
    throw new Error("当前 Agent 会话没有可用的项目上下文");
  }

  const currentProjectContext = buildProjectContext(enterpriseId, [projectId]);
  const libraryItems = buildLibrarySearch(enterpriseId, projectId, query);

  return JSON.stringify({
    ok: true,
    enterpriseId,
    project: { id: project.id, name: project.name },
    query: query || null,
    searchPolicy: {
      currentProject: "all visibility",
      enterprisePublic: "public items from other projects in the same enterprise",
      excluded: "private items from other projects and all items from other enterprises",
    },
    libraryItems,
    currentProjectContext: query && libraryItems.length === 0 ? currentProjectContext : undefined,
  });
}
