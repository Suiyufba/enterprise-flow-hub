import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdirSync, createReadStream, existsSync } from "node:fs";
import { getUser } from "../store.js";
import { listFiles, getFile, createFile, deleteFile } from "../store/files.js";
import { analyzeImageFile } from "../ai/ocr.js";

function getCallerEnterprise(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.headers["x-user-id"] as string | undefined;
  if (!userId) { reply.status(401).send({ error: "未登录" }); return null; }
  const user = getUser(userId);
  if (!user) { reply.status(401).send({ error: "用户不存在" }); return null; }
  return user.enterpriseId;
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  await app.register(import("@fastify/multipart"), {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });

  app.get("/files", async (request, reply) => {
    const { enterpriseId, relatedType, relatedId, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (actorEid !== enterpriseId) return reply.status(403).send({ error: "无权查看其他企业数据" });
    return listFiles(enterpriseId, { relatedType, relatedId, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  });

  app.get("/files/:id/download", async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = getFile(id);
    if (!file) return reply.status(404).send({ error: "文件不存在" });
    if (!existsSync(file.storagePath)) return reply.status(404).send({ error: "文件数据丢失" });
    reply.header("Content-Type", file.mimeType);
    reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(file.filename)}"`);
    return reply.send(createReadStream(file.storagePath));
  });

  app.post("/files/upload", async (request, reply) => {
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: "未选择文件" });

    const buf = await data.toBuffer();
    const dir = join(process.cwd(), "data", "uploads", actorEid);
    mkdirSync(dir, { recursive: true });
    const storageId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = join(dir, storageId);
    writeFileSync(storagePath, buf);

    const relatedType = (data.fields as Record<string, { value: string }>)?.relatedType?.value;
    const relatedId = (data.fields as Record<string, { value: string }>)?.relatedId?.value;

    const file = createFile({
      enterpriseId: actorEid,
      filename: data.filename,
      mimeType: data.mimetype,
      size: buf.length,
      storagePath,
      uploadedBy: request.headers["x-user-id"] as string,
      relatedType,
      relatedId,
    });
    // Trigger async OCR for images
    if (data.mimetype.startsWith("image/")) {
      analyzeImageFile(storagePath, data.mimetype, data.filename).catch(() => {});
    }
    return reply.status(201).send(file);
  });

  app.delete("/files/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getFile(id);
    if (!existing) return reply.status(404).send({ error: "文件不存在" });
    const actorEid = getCallerEnterprise(request, reply);
    if (!actorEid) return;
    if (existing.enterpriseId !== actorEid) return reply.status(403).send({ error: "无权操作" });
    deleteFile(id);
    return reply.status(204).send();
  });
}
