import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export async function csvProfile(input: Record<string, unknown>): Promise<string> {
  const fileName = (input.fileName as string) || "leads.csv";
  const sampleRows = (input.sampleRows as number) || 20;

  // Try a few locations for the file
  const candidates = [
    join(process.cwd(), "data", fileName),
    join(process.cwd(), fileName),
  ];

  let content: string | null = null;
  let foundPath = "";
  for (const p of candidates) {
    if (existsSync(p)) {
      content = readFileSync(p, "utf-8");
      foundPath = p;
      break;
    }
  }

  if (!content) {
    return JSON.stringify({
      error: "File not found",
      searched: candidates,
      hint: `Place ${fileName} in data/ or the project root.`,
    }, null, 2);
  }

  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) {
    return JSON.stringify({ error: "File is empty" });
  }

  // Detect delimiter: comma or tab
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));
  const sample: string[][] = [];
  for (let i = 1; i < Math.min(lines.length, sampleRows + 1); i++) {
    sample.push(lines[i].split(delimiter).map((c) => c.trim().replace(/^"|"$/g, "")));
  }

  // Compute per-column stats
  const stats = headers.map((h, ci) => {
    const values = sample.map((r) => r[ci] ?? "").filter((v) => v !== "");
    const emptyCount = sample.length - values.length;
    const uniqueCount = new Set(values).size;
    return { column: h, index: ci, nonEmpty: values.length, empty: emptyCount, unique: uniqueCount };
  });

  return JSON.stringify({
    file: foundPath,
    delimiter,
    totalRows: lines.length - 1,
    headers,
    sampleRows: sample.slice(0, 5),
    columnStats: stats,
    warnings: stats.filter((s) => s.empty > 0).map((s) => `${s.column}: ${s.empty}/${sample.length} rows empty`),
  }, null, 2);
}
