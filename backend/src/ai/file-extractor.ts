import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { promisify } from "node:util";
import ExcelJS from "exceljs";
import { getFileInternal } from "../store/files.js";
import { extractImageText } from "./ocr.js";

const execFileAsync = promisify(execFile);
const PER_FILE_LIMIT = 40_000;
const TOTAL_LIMIT = 120_000;

function decodeXml(value: string): string {
  return value
    .replace(/<w:tab\/?\s*>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractSpreadsheet(path: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sections: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : Object.values(row.values);
      rows.push(values.map((value) => {
        if (value == null) return "";
        if (typeof value === "object" && "text" in value) return String(value.text);
        if (typeof value === "object" && "result" in value) return String(value.result ?? "");
        return String(value);
      }).join("\t"));
    });
    sections.push(`工作表：${sheet.name}\n${rows.slice(0, 500).join("\n")}`);
  });
  return sections.join("\n\n");
}

async function extractFileText(path: string, mimeType: string, filename: string): Promise<string> {
  const extension = extname(filename).toLowerCase();
  if (mimeType.startsWith("image/")) return extractImageText(path);
  if (mimeType === "application/pdf" || extension === ".pdf") {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", path, "-"], { timeout: 45_000, maxBuffer: 8 * 1024 * 1024 });
    return String(stdout).trim();
  }
  if (extension === ".docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const { stdout } = await execFileAsync("unzip", ["-p", path, "word/document.xml"], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    return decodeXml(String(stdout));
  }
  if (extension === ".doc" || mimeType === "application/msword") {
    const { stdout } = await execFileAsync("antiword", [path], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    return String(stdout).trim();
  }
  if ([".xlsx", ".xlsm"].includes(extension) || mimeType.includes("spreadsheetml")) return extractSpreadsheet(path);
  if ([".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".html"].includes(extension) || mimeType.startsWith("text/")) {
    return (await readFile(path, "utf8")).trim();
  }
  return "";
}

export async function buildChatAttachmentContext(
  fileIds: string[] | undefined,
  enterpriseId: string,
  projectId: string,
): Promise<{ prompt: string; displaySuffix: string }> {
  if (!fileIds?.length) return { prompt: "", displaySuffix: "" };
  const uniqueIds = [...new Set(fileIds)].slice(0, 6);
  const sections: string[] = [];
  const names: string[] = [];
  let remaining = TOTAL_LIMIT;

  for (const fileId of uniqueIds) {
    const file = getFileInternal(fileId);
    if (!file) throw new Error("附件不存在或已被删除");
    if (file.enterpriseId !== enterpriseId) throw new Error("附件不属于当前企业");
    if (file.projectId !== projectId) throw new Error("附件与当前业务子类不一致，请重新选择业务子类或重新上传附件");
    names.push(file.filename);
    try {
      const extracted = await extractFileText(file.storagePath, file.mimeType, file.filename);
      const bounded = extracted.slice(0, Math.min(PER_FILE_LIMIT, remaining));
      remaining -= bounded.length;
      sections.push([
        `### 附件：${file.filename}`,
        `fileId: ${file.id}`,
        `类型: ${file.mimeType}`,
        bounded || "[该格式暂未提取到可读文字，请根据文件元数据说明限制，不要编造内容。]",
      ].join("\n"));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      sections.push(`### 附件：${file.filename}\nfileId: ${file.id}\n[解析失败：${reason.slice(0, 180)}]`);
    }
    if (remaining <= 0) break;
  }

  return {
    prompt: `\n\n## 本轮用户附件\n以下内容由服务器按文件类型提取。回答必须基于真实附件内容；解析失败或字段模糊时明确提示用户。\n\n${sections.join("\n\n")}`,
    displaySuffix: `\n\n附件：${names.join("、")}`,
  };
}
