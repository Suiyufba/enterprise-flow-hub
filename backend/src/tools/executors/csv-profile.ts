import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { getFileInternal, listFiles } from "../../store/files.js";

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  if ("result" in value && value.result !== undefined) return String(value.result ?? "");
  if ("text" in value && typeof value.text === "string") return value.text;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  return JSON.stringify(value);
}

async function readRows(path: string, filename: string, mimeType: string): Promise<{ rows: string[][]; sheet?: string }> {
  const extension = extname(filename).toLowerCase();
  const buffer = readFileSync(path);

  if ([".csv", ".tsv", ".txt"].includes(extension) || ["text/csv", "text/tab-separated-values"].includes(mimeType)) {
    const delimiter = extension === ".tsv" || mimeType === "text/tab-separated-values" ? "\t" : undefined;
    const rows = parse(buffer, {
      bom: true,
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as unknown[][];
    return { rows: rows.map((row) => row.map((value) => value === null || value === undefined ? "" : String(value))) };
  }

  if ([".xlsx", ".xlsm"].includes(extension)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return { rows: [] };
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      rows.push((row.values as ExcelJS.CellValue[]).slice(1).map(cellText));
    });
    return { rows, sheet: worksheet.name };
  }

  throw new Error("当前支持 CSV、TSV、TXT、XLSX 和 XLSM 文件；旧版 XLS 请先另存为 XLSX");
}

export async function csvProfile(input: Record<string, unknown>): Promise<string> {
  const enterpriseId = typeof input._enterpriseId === "string" ? input._enterpriseId : "";
  const projectId = typeof input._projectId === "string" ? input._projectId : "";
  const fileId = typeof input.fileId === "string" ? input.fileId : "";
  const fileName = typeof input.fileName === "string" ? input.fileName.trim() : "";
  const requestedRows = typeof input.sampleRows === "number" ? input.sampleRows : Number(input.sampleRows ?? 20);
  const sampleRows = Math.max(1, Math.min(100, Number.isFinite(requestedRows) ? requestedRows : 20));

  if (!enterpriseId) throw new Error("当前 Agent 会话没有企业上下文");
  const byName = fileName
    ? listFiles(enterpriseId, projectId ? { relatedType: "project", relatedId: projectId, limit: 100 } : { limit: 100 })
      .items.find((item) => item.filename === fileName)
    : undefined;
  const file = getFileInternal(fileId || byName?.id || "");
  if (!file || file.enterpriseId !== enterpriseId || (projectId && file.relatedId !== projectId)) {
    throw new Error("没有在当前项目找到这个文件，请先到文件管理上传并选择正确项目");
  }
  if (!existsSync(file.storagePath)) throw new Error("文件记录存在，但存储内容已丢失");

  const { rows, sheet } = await readRows(file.storagePath, file.filename, file.mimeType);
  if (rows.length === 0) throw new Error("文件为空或没有可读取的工作表");

  const headers = rows[0].map((header, index) => header.trim() || `column_${index + 1}`);
  const sample = rows.slice(1, sampleRows + 1);
  const stats = headers.map((header, columnIndex) => {
    const values = sample.map((row) => row[columnIndex] ?? "");
    const nonEmptyValues = values.filter(Boolean);
    return {
      column: header,
      index: columnIndex,
      nonEmpty: nonEmptyValues.length,
      empty: values.length - nonEmptyValues.length,
      unique: new Set(nonEmptyValues).size,
    };
  });

  return JSON.stringify({
    ok: true,
    file: { id: file.id, filename: file.filename, mimeType: file.mimeType, projectId: file.relatedId },
    sheet: sheet ?? null,
    totalRows: Math.max(0, rows.length - 1),
    headers,
    sampleRows: sample.slice(0, 8),
    columnStats: stats,
    warnings: stats.filter((stat) => stat.empty > 0).map((stat) => `${stat.column}: 样例中 ${stat.empty}/${sample.length} 行为空`),
  });
}
