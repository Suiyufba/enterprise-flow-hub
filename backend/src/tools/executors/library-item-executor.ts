import { createLibraryItem } from "../../store.js";

export async function libraryItemExecute(input: Record<string, unknown>): Promise<string> {
  const enterpriseId = typeof input._enterpriseId === "string" ? input._enterpriseId : (typeof input.enterpriseId === "string" ? input.enterpriseId : "");
  const projectId = typeof input._projectId === "string" ? input._projectId : (typeof input.projectId === "string" ? input.projectId : "");
  const name = typeof input.name === "string" ? input.name : "";
  const type = (typeof input.type === "string" && ["screenshot", "spreadsheet", "document", "note"].includes(input.type))
    ? input.type as "screenshot" | "spreadsheet" | "document" | "note"
    : "note";
  const summary = typeof input.summary === "string" ? input.summary : "";
  const visibility = (typeof input.visibility === "string" && ["public", "private"].includes(input.visibility))
    ? input.visibility as "public" | "private"
    : "public";

  if (!enterpriseId || !projectId || !name.trim() || !summary.trim()) {
    return JSON.stringify({
      error: "缺少必要参数",
      required: "enterpriseId, projectId, name, summary",
      received: { enterpriseId, projectId, name, type, summary, visibility },
    });
  }

  const item = createLibraryItem({ enterpriseId, projectId, name, type, summary, visibility });
  if (!item) {
    return JSON.stringify({ error: "创建失败，项目不存在或参数无效" });
  }

  return JSON.stringify({
    ok: true,
    item: { id: item.id, name: item.name, type: item.type },
    message: `已成功创建业务资料「${item.name}」`,
  });
}
