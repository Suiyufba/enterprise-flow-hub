import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createReadStream, existsSync } from "node:fs";
import { listFiles, getFileInternal, createFile, deleteFile, ensureUploadDir } from "../store/files.js";
import { analyzeImageFile, recognizeInvoiceFile } from "../ai/ocr.js";
import { findInvoiceByIdentity } from "../store/orders.js";
import { canAccessEnterprise, requireRequestActor } from "./auth-context.js";
import { triggerProjectAutomations } from "../automation/scheduler.js";
import { getProject } from "../store.js";
import { emitEvent } from "../events/emitter.js";

const OCR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  await app.register(import("@fastify/multipart"), {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });

  app.get("/files", async (request, reply) => {
    const { enterpriseId, projectId, relatedType, relatedId, page, limit } = request.query as Record<string, string | undefined>;
    if (!enterpriseId) return { items: [], total: 0, page: 1, limit: 20 };
    if (!canAccessEnterprise(request, enterpriseId, reply)) return;
    return listFiles(enterpriseId, { projectId, relatedType, relatedId, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  });

  app.get("/files/:id/download", async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = getFileInternal(id);
    if (!file) return reply.status(404).send({ error: "文件不存在" });
    if (!canAccessEnterprise(request, file.enterpriseId, reply)) return;
    if (!existsSync(file.storagePath)) return reply.status(404).send({ error: "文件数据丢失" });
    reply.header("Content-Type", file.mimeType);
    reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(file.filename)}"`);
    return reply.send(createReadStream(file.storagePath));
  });

  app.post("/files/upload", async (request, reply) => {
    const actor = requireRequestActor(request, reply);
    if (!actor) return;
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: "未选择文件" });

    const relatedType = (data.fields as Record<string, { value: string }>)?.relatedType?.value;
    const relatedId = (data.fields as Record<string, { value: string }>)?.relatedId?.value;
    if (relatedType !== "project" || !relatedId) {
      return reply.status(400).send({ error: "文件必须归属到一个项目" });
    }
    const project = getProject(relatedId);
    if (!project) return reply.status(404).send({ error: "项目不存在" });
    if (!canAccessEnterprise(request, project.enterpriseId, reply)) return;
    const targetEnterpriseId = project.enterpriseId;

    const buf = await data.toBuffer();
    const dir = ensureUploadDir(targetEnterpriseId);
    const storageId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = join(dir, storageId);
    writeFileSync(storagePath, buf);

    const file = createFile({
      enterpriseId: targetEnterpriseId,
      projectId: project.id,
      filename: data.filename,
      mimeType: data.mimetype,
      size: buf.length,
      storagePath,
      uploadedBy: actor.id,
      relatedType,
      relatedId,
    });
    emitEvent("create", "file", file.id, file as unknown as Record<string, unknown>, "api");
    void triggerProjectAutomations("file", relatedId, {
      source: "file",
      fileId: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      enterpriseId: targetEnterpriseId,
    }, app.log).catch((error) => {
      app.log.error({ err: error, projectId: relatedId, fileId: file.id }, "File automation failed");
    });
    return reply.status(201).send(file);
  });

  app.post("/files/:id/ocr", async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = getFileInternal(id);
    if (!file) return reply.status(404).send({ error: "文件不存在" });
    if (!canAccessEnterprise(request, file.enterpriseId, reply)) return;
    if (!OCR_MIME_TYPES.has(file.mimeType)) return reply.status(400).send({ error: "OCR 仅支持 PNG、JPEG、WebP 或 GIF 图片" });
    const result = await analyzeImageFile(file.storagePath, file.mimeType, file.filename);
    if (!result) return reply.status(400).send({ error: "OCR 分析失败，文件可能不是图片或无法识别" });
    return reply.send(result);
  });

  app.post("/files/:id/ocr/invoice", async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = getFileInternal(id);
    if (!file) return reply.status(404).send({ error: "文件不存在" });
    if (!canAccessEnterprise(request, file.enterpriseId, reply)) return;
    if (!OCR_MIME_TYPES.has(file.mimeType)) return reply.status(400).send({ error: "发票 OCR 仅支持 PNG、JPEG、WebP 或 GIF 图片" });
    if (file.size > 15 * 1024 * 1024) return reply.status(400).send({ error: "发票图片不能超过 15MB" });
    try {
      const candidate = await recognizeInvoiceFile(file.storagePath, file.mimeType, file.filename, file.id);
      const duplicate = candidate.invoiceNumber
        ? findInvoiceByIdentity(file.enterpriseId, candidate.invoiceNumber, candidate.invoiceCode)
        : undefined;
      if (duplicate) {
        candidate.duplicateInvoiceId = duplicate.id;
        candidate.warnings.push(`该发票号码已存在（${duplicate.id}）`);
      }
      return reply.send(candidate);
    } catch (error) {
      request.log.warn({ err: error, fileId: id }, "Invoice OCR failed");
      return reply.status(422).send({ error: error instanceof Error ? error.message : "发票识别失败" });
    }
  });

  app.delete("/files/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getFileInternal(id);
    if (!existing) return reply.status(404).send({ error: "文件不存在" });
    if (!canAccessEnterprise(request, existing.enterpriseId, reply)) return;
    deleteFile(id);
    emitEvent("delete", "file", id, existing as unknown as Record<string, unknown>, "api");
    return reply.status(204).send();
  });
}
