import { buildProjectContext, getProject } from "../../store.js";

export async function companyContextExecute(input: Record<string, unknown>): Promise<string> {
  const enterpriseId = typeof input._enterpriseId === "string" ? input._enterpriseId : "";
  const projectId = typeof input._projectId === "string" ? input._projectId : "";
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const project = getProject(projectId);

  if (!enterpriseId || !project || project.enterpriseId !== enterpriseId) {
    throw new Error("当前 Agent 会话没有可用的项目上下文");
  }

  const context = buildProjectContext(enterpriseId, [projectId]);
  const lines = context.split("\n");
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matched = terms.length
    ? lines.filter((line) => terms.some((term) => line.toLowerCase().includes(term)))
    : lines;

  return JSON.stringify({
    ok: true,
    enterpriseId,
    project: { id: project.id, name: project.name },
    query: query || null,
    matches: matched.slice(0, 80),
    context: terms.length && matched.length === 0 ? context.slice(0, 8000) : undefined,
  });
}
