import { getDb } from "./db/index.js";

export function projectBelongsToEnterprise(projectId: string, enterpriseId: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM projects WHERE id=? AND enterprise_id=?").get(projectId, enterpriseId));
}

export function defaultProjectId(enterpriseId: string): string {
  const row = getDb().prepare(
    "SELECT id FROM projects WHERE enterprise_id=? ORDER BY created_at, id LIMIT 1",
  ).get(enterpriseId) as { id: string } | undefined;
  if (!row) throw new Error("当前企业还没有可用项目，请先创建项目");
  return row.id;
}

export function resolveProjectId(enterpriseId: string, requestedProjectId?: string | null): string {
  if (!requestedProjectId) return defaultProjectId(enterpriseId);
  if (!projectBelongsToEnterprise(requestedProjectId, enterpriseId)) {
    throw new Error("项目不存在或不属于当前企业");
  }
  return requestedProjectId;
}
