# MVP Analysis Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the screenshot-first AI workflow analysis flow: user uploads screenshots + describes need → backend returns structured analysis (mocked) → frontend displays results with export.

**Architecture:** pnpm monorepo with `shared/` types consumed by both `backend/` (Fastify REST API with in-memory store + mocked AI) and `frontend/` (Next.js App Router with Codex-style white-theme UI). Analysis data flows: Frontend POST multipart → Backend stores + returns mocked JSON → Frontend renders sections. Export generates Markdown/JSON client-side from analysis data.

**Tech Stack:** TypeScript, Fastify, Next.js 15 (App Router), React 19, plain CSS (no Tailwind — keep it simple), Zod for validation.

**Design:** White theme, Codex-style layout — sidebar (240px, #f0f0f2) + centered main content (max-width 640px). Input view: big prompt card with screenshot attach + need textarea + model selector + submit button, plus 3 quick-start cards below. Results view: structured card sections. Click "上传业务截图" card or submit to trigger analysis → results appear.

---

## File Structure

```
enterprise-flow-hub/
├── shared/                          # NEW — shared types package
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                 # barrel export
│       └── analysis.ts              # AI JSON schema types + mock data
├── backend/
│   └── src/
│       ├── main.ts                  # MODIFY — add routes
│       ├── routes/
│       │   └── analysis.ts          # NEW — POST/GET analysis endpoints
│       ├── store.ts                 # NEW — in-memory analysis store
│       └── ai/
│           └── mock.ts              # NEW — mock AI response generator
├── frontend/
│   └── app/
│       ├── layout.tsx               # MODIFY — add sidebar + global CSS
│       ├── page.tsx                 # REWRITE — main input view
│       ├── globals.css              # NEW — all styles
│       └── results/
│           └── page.tsx             # NEW — results view
```

Each file has one clear responsibility:
- `shared/src/analysis.ts` — type definitions + Zod schemas + mock data. No runtime deps beyond zod.
- `backend/src/routes/analysis.ts` — Fastify route handlers. Depends on store + mock ai.
- `backend/src/store.ts` — `Map<string, Analysis>` with get/set. Pure data.
- `backend/src/ai/mock.ts` — generates mock analysis from input params. Pure function.
- `frontend/app/page.tsx` — input view (screenshot dropzone, need textarea, submit). Client component.
- `frontend/app/results/page.tsx` — results view. Reads analysis from searchParams or fetches by id.
- `frontend/app/globals.css` — all styles, no CSS-in-JS.

---

## Phase 1: Shared Types + Mock Data

### Task 1.1: Create shared package

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/index.ts`
- Create: `shared/src/analysis.ts`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Create shared/package.json**

```json
{
  "name": "shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "zod": "^3.25.28"
  }
}
```

- [ ] **Step 2: Create shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Update pnpm-workspace.yaml**

```yaml
packages:
  - frontend
  - backend
  - shared
```

- [ ] **Step 4: Create shared/src/analysis.ts** — types, Zod schemas, mock data

```typescript
import { z } from "zod";

// ---- Zod Schemas ----

export const AnalysisFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(["text", "number", "date", "enum", "ref", "boolean"]),
  options: z.array(z.string()).optional(),
  refEntity: z.string().optional(),
  missing: z.boolean().optional(),
});

export const AutomationRuleSchema = z.object({
  trigger: z.string(),
  condition: z.string(),
  action: z.string(),
});

export const AnalysisRequestSchema = z.object({
  need: z.string().min(1).max(500),
  businessType: z.string().optional(),
  tools: z.string().optional(),
  screenshotCount: z.number().int().min(1).max(8),
});

export const AnalysisResultSchema = z.object({
  id: z.string(),
  summary: z.string(),
  screenshotTypes: z.array(z.string()),
  businessObjects: z.array(z.string()),
  fields: z.array(AnalysisFieldSchema),
  workflowStages: z.array(z.string()),
  problems: z.array(z.string()),
  automationRules: z.array(AutomationRuleSchema),
  dashboardMetrics: z.array(z.string()),
  implementationPlan: z.array(z.string()),
  createdAt: z.string(),
});

// ---- TypeScript Types ----

export type AnalysisField = z.infer<typeof AnalysisFieldSchema>;
export type AutomationRule = z.infer<typeof AutomationRuleSchema>;
export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ---- Mock Data ----

export const MOCK_ANALYSIS: AnalysisResult = {
  id: "",
  summary:
    "This looks like a lead tracking spreadsheet for an education agency. The process has clear stages but is missing ownership tracking and follow-up mechanisms.",
  screenshotTypes: ["spreadsheet", "chat"],
  businessObjects: ["Lead", "Consultant", "FollowUpTask"],
  fields: [
    { name: "customerName", label: "Customer Name", type: "text" },
    {
      name: "stage",
      label: "Stage",
      type: "enum",
      options: ["new", "contacted", "quoted", "signed", "lost"],
    },
    { name: "consultant", label: "Assigned Consultant", type: "ref", refEntity: "Consultant" },
    { name: "nextFollowUp", label: "Next Follow-up", type: "date", missing: true },
  ],
  workflowStages: ["新线索", "已联系", "已报价", "已签约", "已流失"],
  problems: [
    "No next follow-up date field — leads can fall through cracks.",
    "Owner/consultant field is missing for several leads.",
  ],
  automationRules: [
    {
      trigger: "lead.created",
      condition: "no owner after 2 hours",
      action: "alert_manager",
    },
    {
      trigger: "lead.stage_changed",
      condition: "stage == quoted AND no follow-up after 3 days",
      action: "create_follow_up_task",
    },
  ],
  dashboardMetrics: ["new leads", "overdue follow-ups", "conversion rate"],
  implementationPlan: [
    "Create normalized lead table with required owner field.",
    "Add automated follow-up reminder rule.",
    "Build consultant daily status dashboard.",
  ],
  createdAt: new Date().toISOString(),
};
```

- [ ] **Step 5: Create shared/src/index.ts**

```typescript
export * from "./analysis.js";
```

- [ ] **Step 6: Install dependencies and verify**

```bash
cd /Users/junqiliu/Desktop/IT/enterprise-flow-hub && pnpm install
```

Expected: shared package links into workspace, no errors.

- [ ] **Step 7: Commit**

```bash
git add shared/ pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: add shared types package with analysis schema and mock data"
```

---

## Phase 2: Backend Analysis API

### Task 2.1: Add shared dependency to backend

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Add shared to backend dependencies**

```bash
cd /Users/junqiliu/Desktop/IT/enterprise-flow-hub && pnpm --filter backend add shared@workspace:*
```

### Task 2.2: Create in-memory store

**Files:**
- Create: `backend/src/store.ts`

- [ ] **Step 1: Write store**

```typescript
import type { AnalysisResult } from "shared";

const store = new Map<string, AnalysisResult>();

export function saveAnalysis(analysis: AnalysisResult): void {
  store.set(analysis.id, analysis);
}

export function getAnalysis(id: string): AnalysisResult | undefined {
  return store.get(id);
}
```

### Task 2.3: Create mock AI generator

**Files:**
- Create: `backend/src/ai/mock.ts`

- [ ] **Step 1: Write mock AI function**

```typescript
import { MOCK_ANALYSIS, type AnalysisRequest, type AnalysisResult } from "shared";
import { randomUUID } from "node:crypto";

export function generateMockAnalysis(input: AnalysisRequest): AnalysisResult {
  const id = randomUUID();
  return {
    ...MOCK_ANALYSIS,
    id,
    summary: `This looks like a ${input.businessType ?? "business"} process. ${MOCK_ANALYSIS.summary}`,
    createdAt: new Date().toISOString(),
  };
}
```

### Task 2.4: Create analysis routes

**Files:**
- Create: `backend/src/routes/analysis.ts`

- [ ] **Step 1: Write route handlers**

```typescript
import type { FastifyInstance } from "fastify";
import { AnalysisRequestSchema } from "shared";
import { generateMockAnalysis } from "../ai/mock.js";
import { saveAnalysis, getAnalysis } from "../store.js";

export async function analysisRoutes(app: FastifyInstance) {
  // POST /analysis — submit screenshots + need for analysis
  app.post("/analysis", async (request, reply) => {
    const parseResult = AnalysisRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten() });
    }
    const result = generateMockAnalysis(parseResult.data);
    saveAnalysis(result);
    return reply.status(201).send(result);
  });

  // GET /analysis/:id — get analysis result
  app.get("/analysis/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = getAnalysis(id);
    if (!result) {
      return reply.status(404).send({ error: "Analysis not found" });
    }
    return result;
  });
}
```

### Task 2.5: Create export route

**Files:**
- Create: `backend/src/routes/export.ts`

- [ ] **Step 1: Write export handlers (Markdown + JSON)**

```typescript
import type { FastifyInstance } from "fastify";
import { getAnalysis } from "../store.js";

function toMarkdown(a: ReturnType<typeof getAnalysis>): string {
  if (!a) return "";
  return [
    `# Analysis Report`,
    ``,
    `> ${a.summary}`,
    ``,
    `## Screenshot Types`,
    ...a.screenshotTypes.map((t) => `- ${t}`),
    ``,
    `## Business Objects`,
    ...a.businessObjects.map((o) => `- ${o}`),
    ``,
    `## Fields`,
    ...a.fields.map((f) => `- **${f.name}** (${f.type}): ${f.label}${f.missing ? " ⚠ missing" : ""}`),
    ``,
    `## Workflow Stages`,
    a.workflowStages.join(" → "),
    ``,
    `## Problems`,
    ...a.problems.map((p) => `- ⚠ ${p}`),
    ``,
    `## Automation Rules`,
    ...a.automationRules.map((r) => `- IF ${r.trigger} AND ${r.condition} → ${r.action}`),
    ``,
    `## Dashboard Metrics`,
    ...a.dashboardMetrics.map((m) => `- ${m}`),
    ``,
    `## Implementation Plan`,
    ...a.implementationPlan.map((s, i) => `${i + 1}. ${s}`),
    ``,
  ].join("\n");
}

export async function exportRoutes(app: FastifyInstance) {
  app.post("/analysis/:id/export", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { format } = request.body as { format: "markdown" | "json" };
    const analysis = getAnalysis(id);
    if (!analysis) {
      return reply.status(404).send({ error: "Analysis not found" });
    }
    if (format === "markdown") {
      return reply.header("Content-Type", "text/markdown").send(toMarkdown(analysis));
    }
    return analysis;
  });
}
```

### Task 2.6: Wire routes into main.ts

**Files:**
- Modify: `backend/src/main.ts`

- [ ] **Step 1: Update main.ts to register routes**

Replace entire file content:

```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import { analysisRoutes } from "./routes/analysis.js";
import { exportRoutes } from "./routes/export.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

await app.register(analysisRoutes);
await app.register(exportRoutes);

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

await app.listen({ port, host });
```

- [ ] **Step 2: Verify backend compiles and starts**

```bash
cd /Users/junqiliu/Desktop/IT/enterprise-flow-hub && pnpm --filter backend dev &
sleep 3
curl -X POST http://localhost:4000/analysis \
  -H "Content-Type: application/json" \
  -d '{"need":"test","screenshotCount":1}' | head -c 200
```

Expected: returns JSON with id, summary, fields, etc. Store the id.

- [ ] **Step 3: Test export endpoint**

```bash
curl -X POST http://localhost:4000/analysis/<ID>/export \
  -H "Content-Type: application/json" \
  -d '{"format":"markdown"}'
```

Expected: returns Markdown text.

- [ ] **Step 4: Kill dev server and commit**

```bash
git add backend/src/ backend/package.json pnpm-lock.yaml
git commit -m "feat: add analysis and export API endpoints with mocked AI"
```

---

## Phase 3: Frontend — Codex-Style UI

### Task 3.1: Add shared dependency to frontend

**Files:**
- Modify: `frontend/package.json`

```bash
cd /Users/junqiliu/Desktop/IT/enterprise-flow-hub && pnpm --filter frontend add shared@workspace:*
```

### Task 3.2: Create global styles

**Files:**
- Create: `frontend/app/globals.css`

The CSS defines the entire white-theme Codex-style design system: sidebar (#f0f0f2), centered main content (max-width 640px), prompt card (white, rounded 18px, subtle border), form elements, result cards, tag styles, stage flow, problem/rule items. No CSS-in-JS, no Tailwind.

Write the complete CSS file (this is the largest single file, ~250 lines, covering sidebar, main layout, input components, result sections, and responsive breakpoints).

- [ ] **Step 1: Create frontend/app/globals.css**

```css
/* ---- Reset ---- */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ---- Body & Root Layout ---- */
html, body { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Pro Text', system-ui, sans-serif;
  background: #f5f5f7;
  color: #1d1d1f;
  display: flex;
}

/* ---- Sidebar ---- */
.sidebar {
  width: 240px;
  background: #f0f0f2;
  border-right: 1px solid #e0e0e4;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  padding: 12px;
  gap: 2px;
}
.sidebar .win-controls { display: flex; gap: 6px; padding: 4px 4px 16px; }
.sidebar .win-dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.1); }
.sidebar .win-dot.red    { background: #ed6a5e; }
.sidebar .win-dot.yellow { background: #f5bf4f; }
.sidebar .win-dot.green  { background: #62c554; }
.sidebar .nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; border-radius: 8px;
  font-size: 14px; color: #3a3a3c;
  cursor: pointer; font-weight: 450;
  transition: background 0.15s; border: none; background: none;
  width: 100%; text-align: left; font-family: inherit;
}
.sidebar .nav-item:hover { background: #e0e0e4; }
.sidebar .nav-item.active { background: #d8d8dc; }
.sidebar .nav-item .icon { font-size: 16px; width: 22px; text-align: center; }
.sidebar .section-label { font-size: 11px; font-weight: 600; color: #86868b; padding: 20px 12px 4px; }
.sidebar .spacer { flex: 1; }
.sidebar .sidebar-footer { padding: 12px 0 0; border-top: 1px solid #e0e0e4; font-size: 11px; color: #aeaeb2; }

/* ---- Main Content ---- */
.main {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: flex-start;
  padding-top: 80px; overflow-y: auto;
}
.main-inner { width: 100%; max-width: 640px; padding: 0 24px; }
.main-title { text-align: center; font-size: 36px; font-weight: 700; margin-bottom: 24px; letter-spacing: -0.5px; }

/* ---- Prompt Card ---- */
.prompt-card {
  background: #fff; border: 1px solid #d2d2d7;
  border-radius: 18px; padding: 8px 14px 10px;
  margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.prompt-main-row { display: flex; align-items: flex-start; gap: 10px; }
.prompt-left-actions { display: flex; align-items: center; gap: 6px; padding-top: 9px; flex-shrink: 0; }
.prompt-left-actions .attach-btn {
  width: 30px; height: 30px; border-radius: 50%;
  border: 1px solid #d2d2d7; background: #fff;
  font-size: 18px; cursor: pointer; display: flex;
  align-items: center; justify-content: center; color: #6e6e73;
  line-height: 1; padding: 0;
}
.prompt-left-actions .attach-btn:hover { background: #f5f5f7; }
.prompt-left-actions .access-badge {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: #6e6e73; padding: 5px 10px;
  border-radius: 14px; background: #f5f5f7; cursor: pointer; border: none;
}
.prompt-textarea-wrap { flex: 1; }
.prompt-textarea-wrap textarea {
  width: 100%; border: none; outline: none; resize: none;
  font-size: 16px; font-family: inherit; color: #1d1d1f;
  background: transparent; padding: 8px 0; line-height: 1.5;
  min-height: 44px; max-height: 160px;
}
.prompt-textarea-wrap textarea::placeholder { color: #aeaeb2; }
.prompt-right-actions { display: flex; align-items: center; gap: 6px; padding-top: 9px; flex-shrink: 0; }
.prompt-right-actions .model-select {
  font-size: 13px; color: #1d1d1f; padding: 5px 10px;
  border-radius: 14px; background: #f5f5f7; cursor: pointer;
  display: flex; align-items: center; gap: 4px; border: none;
}
.prompt-right-actions .submit-btn {
  width: 32px; height: 32px; border-radius: 50%;
  background: #1d1d1f; border: none; color: #fff;
  font-size: 16px; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
}
.prompt-right-actions .submit-btn:hover { background: #333; }
.prompt-right-actions .submit-btn:disabled { background: #aeaeb2; cursor: not-allowed; }
.prompt-bottom-row { display: flex; align-items: center; gap: 10px; margin-top: 2px; padding-left: 4px; }
.prompt-bottom-row .mode-btn {
  font-size: 13px; color: #6e6e73; padding: 6px 12px;
  border-radius: 14px; cursor: pointer; display: flex;
  align-items: center; gap: 5px; background: #f5f5f7; border: none;
}
.prompt-bottom-row .mode-btn:hover { background: #e8e8eb; }
.prompt-bottom-row .file-list { font-size: 11px; color: #aeaeb2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- Screenshot Previews ---- */
.screenshot-previews { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.screenshot-thumb {
  width: 72px; height: 56px; border-radius: 8px; border: 1px solid #d2d2d7;
  object-fit: cover; background: #f5f5f7;
}

/* ---- Cards Grid ---- */
.cards-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.action-card {
  background: #fff; border: 1px solid #d2d2d7;
  border-radius: 14px; padding: 20px 18px; cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.action-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); border-color: #aeaeb2; }
.action-card .card-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; margin-bottom: 12px;
}
.action-card .card-icon.purple { background: #f0e6ff; }
.action-card .card-icon.blue   { background: #e6f0ff; }
.action-card .card-icon.green  { background: #e6fff0; }
.action-card h3 { font-size: 14px; font-weight: 590; margin-bottom: 4px; }
.action-card p { font-size: 12px; color: #86868b; line-height: 1.4; }

/* ---- Results View ---- */
.results-inner { width: 100%; max-width: 720px; padding: 0 24px 40px; }
.results-back { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.results-back button { background: none; border: none; font-size: 18px; cursor: pointer; color: #6e6e73; padding: 4px 8px; }
.results-back button:hover { color: #1d1d1f; }
.results-back h1 { font-size: 22px; font-weight: 700; }

.result-card {
  background: #fff; border: 1px solid #d2d2d7;
  border-radius: 14px; padding: 20px 18px; margin-bottom: 14px;
}
.result-card h2 { font-size: 15px; line-height: 1.5; font-weight: 450; }
.result-card h3 {
  font-size: 13px; font-weight: 600; color: #8839ef;
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;
}
.result-card h3.warn { color: #e65100; }

.tag-list { display: flex; gap: 8px; flex-wrap: wrap; }
.tag { font-size: 12px; padding: 4px 12px; border-radius: 12px; }
.tag.green { background: #e8f5e9; color: #2e7d32; }
.tag.blue  { background: #e3f2fd; color: #1565c0; }
.tag.purple { background: #f3e5f5; color: #7b1fa2; }
.tag.gray  { background: #f0f0f2; color: #3a3a3c; }

.stage-flow {
  display: flex; align-items: center;
  border: 1px solid #d2d2d7; border-radius: 8px; overflow: hidden;
}
.stage-item {
  flex: 1; text-align: center; padding: 10px 4px;
  font-size: 12px; background: #f8f8fa; border-right: 1px solid #d2d2d7;
}
.stage-item:last-child { border-right: none; }
.stage-arrow { color: #aeaeb2; padding: 0 2px; font-size: 12px; flex-shrink: 0; }

.code-block {
  background: #f8f8fa; border: 1px solid #d2d2d7;
  border-radius: 8px; padding: 12px 14px;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12px; line-height: 1.7; white-space: pre; overflow-x: auto;
}
.code-block .key { color: #8839ef; }
.code-block .str { color: #40a02b; }
.code-block .warn { color: #fe640b; }

.problem-item {
  padding: 10px 12px; background: #fff8e1;
  border-left: 3px solid #e65100;
  border-radius: 0 8px 8px 0; margin-bottom: 6px; font-size: 13px;
}

.rule-item {
  padding: 10px 12px; background: #e8eaf6;
  border-left: 3px solid #1e88e5;
  border-radius: 0 8px 8px 0; margin-bottom: 6px; font-size: 12px;
}

.export-bar { display: flex; gap: 8px; padding-top: 8px; flex-wrap: wrap; }
.export-btn {
  padding: 8px 16px; background: #f5f5f7; border: 1px solid #d2d2d7;
  border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit;
}
.export-btn:hover { background: #e8e8eb; }

/* ---- Loading ---- */
.loading { text-align: center; padding: 60px 0; color: #86868b; }
.loading .spinner {
  width: 32px; height: 32px; border: 3px solid #e0e0e4;
  border-top-color: #8839ef; border-radius: 50%;
  animation: spin 0.8s linear infinite; margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ---- Responsive ---- */
@media (max-width: 800px) {
  .cards-grid { grid-template-columns: 1fr; }
  .sidebar { width: 200px; }
  .main-inner { max-width: 100%; }
}
```

### Task 3.3: Rewrite layout.tsx with sidebar

**Files:**
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Replace layout.tsx**

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Flow Hub",
  description: "Screenshot-first AI workflow analyst",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <aside className="sidebar">
          <div className="win-controls">
            <span className="win-dot red" />
            <span className="win-dot yellow" />
            <span className="win-dot green" />
          </div>

          <a href="/" className="nav-item active">
            <span className="icon">✦</span> 新分析
          </a>

          <div className="section-label">历史</div>
          <div className="nav-item" style={{ color: "#aeaeb2", cursor: "default" }}>
            <span className="icon">💬</span> 暂无记录
          </div>

          <div className="spacer" />
          <div className="sidebar-footer">v0.1.0 MVP</div>
        </aside>

        <main className="main">{children}</main>
      </body>
    </html>
  );
}
```

### Task 3.4: Rewrite page.tsx — Input View

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Write the input page**

```tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisResult, AnalysisRequest } from "shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function Home() {
  const router = useRouter();
  const [need, setNeed] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [tools, setTools] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFiles(selected: FileList | null) {
    if (!selected) return;
    const incoming = Array.from(selected).slice(0, 8);
    const merged = [...files, ...incoming].slice(0, 8);
    setFiles(merged);
    setPreviews(merged.map((f) => URL.createObjectURL(f)));
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    if (!need.trim()) return;
    setLoading(true);
    setError("");

    try {
      const body: AnalysisRequest = {
        need: need.trim(),
        businessType: businessType || undefined,
        tools: tools || undefined,
        screenshotCount: files.length || 1,
      };

      const res = await fetch(`${API}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("分析失败，请重试");

      const data: AnalysisResult = await res.json();
      // Store in sessionStorage so results page can read it
      sessionStorage.setItem(`analysis:${data.id}`, JSON.stringify(data));
      router.push(`/results?id=${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="main-inner">
        <div className="loading">
          <div className="spinner" />
          <p>AI 正在分析你的业务流程...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-inner">
      <h1 className="main-title">今天想分析什么流程？</h1>

      {/* Prompt Card */}
      <div className="prompt-card">
        <div className="prompt-main-row">
          <div className="prompt-left-actions">
            <button
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="上传截图"
            >
              +
            </button>
            <span className="access-badge">
              <span style={{ color: "#ff9500", fontSize: 10 }}>⚠</span>
              上传截图
            </span>
          </div>

          <div className="prompt-textarea-wrap">
            <textarea
              placeholder="描述你的业务需求..."
              rows={1}
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          <div className="prompt-right-actions">
            <span className="model-select">
              AI 分析
              <span style={{ fontSize: 9 }}>▾</span>
            </span>
            <button className="submit-btn" onClick={submit} disabled={!need.trim()} title="开始分析">
              ↑
            </button>
          </div>
        </div>

        {/* Bottom row */}
        {files.length > 0 && (
          <div className="prompt-bottom-row">
            <button className="mode-btn" onClick={() => fileInputRef.current?.click()}>
              <span>📸</span> 已添加 {files.length} 张截图
              <span style={{ fontSize: 9 }}>▾</span>
            </button>
            <span className="file-list">
              {files.map((f) => f.name).join(", ")}
            </span>
          </div>
        )}

        {files.length === 0 && (
          <div className="prompt-bottom-row">
            <button className="mode-btn" onClick={() => fileInputRef.current?.click()}>
              <span>📸</span> 添加截图
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Screenshot Previews */}
      {previews.length > 0 && (
        <div className="screenshot-previews">
          {previews.map((url, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={url} alt={`Screenshot ${i + 1}`} className="screenshot-thumb" />
              <button
                onClick={() => removeFile(i)}
                style={{
                  position: "absolute", top: -6, right: -6,
                  width: 20, height: 20, borderRadius: "50%",
                  background: "#ff3b30", color: "#fff", border: "none",
                  fontSize: 12, cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ color: "#d20f39", fontSize: 13, marginBottom: 12, textAlign: "center" }}>
          {error}
        </div>
      )}

      {/* Quick Start Cards */}
      <div className="cards-grid">
        <div className="action-card" onClick={() => fileInputRef.current?.click()}>
          <div className="card-icon purple">📸</div>
          <h3>上传业务截图</h3>
          <p>上传 Excel、CRM 页面或聊天记录，AI 自动识别流程</p>
        </div>
        <div className="action-card">
          <div className="card-icon blue">📋</div>
          <h3>选择模板场景</h3>
          <p>销售跟进、订单管理、客户服务等预设分析模板</p>
        </div>
        <div className="action-card">
          <div className="card-icon green">📊</div>
          <h3>查看诊断案例</h3>
          <p>留学中介的线索管理优化报告</p>
        </div>
      </div>

      {/* Optional fields */}
      <details style={{ marginTop: 24, textAlign: "center" }}>
        <summary style={{ fontSize: 12, color: "#86868b", cursor: "pointer" }}>更多选项</summary>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, maxWidth: 320, margin: "12px auto 0" }}>
          <select
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            style={{
              padding: "8px 12px", borderRadius: 8, border: "1px solid #d2d2d7",
              fontSize: 13, background: "#fff", fontFamily: "inherit",
            }}
          >
            <option value="">公司类型（可选）</option>
            <option value="留学/移民中介">留学/移民中介</option>
            <option value="教育培训">教育培训</option>
            <option value="企业服务">企业服务</option>
            <option value="电商">电商</option>
          </select>
          <input
            type="text"
            placeholder="当前使用的工具（可选）如：飞书、Excel"
            value={tools}
            onChange={(e) => setTools(e.target.value)}
            style={{
              padding: "8px 12px", borderRadius: 8, border: "1px solid #d2d2d7",
              fontSize: 13, background: "#fff", fontFamily: "inherit",
            }}
          />
        </div>
      </details>
    </div>
  );
}
```

### Task 3.5: Create results page

**Files:**
- Create: `frontend/app/results/page.tsx`

- [ ] **Step 1: Write results page**

```tsx
"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { AnalysisResult } from "shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    // Try sessionStorage first
    const cached = sessionStorage.getItem(`analysis:${id}`);
    if (cached) {
      setData(JSON.parse(cached));
      setLoading(false);
      return;
    }

    // Fallback to API
    fetch(`${API}/analysis/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  function exportResult(format: "markdown" | "json") {
    if (!id) return;
    fetch(`${API}/analysis/${id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format }),
    })
      .then((r) => (format === "json" ? r.json() : r.text()))
      .then((content) => {
        const blob = new Blob([typeof content === "string" ? content : JSON.stringify(content, null, 2)], {
          type: format === "markdown" ? "text/markdown" : "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `analysis-${id}.${format === "markdown" ? "md" : "json"}`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  if (loading) {
    return (
      <div className="results-inner">
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="results-inner">
        <p style={{ textAlign: "center", color: "#86868b", paddingTop: 60 }}>
          未找到分析结果
        </p>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="export-btn" onClick={() => router.push("/")}>
            ← 新建分析
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="results-inner">
      {/* Back + Title */}
      <div className="results-back">
        <button onClick={() => router.push("/")}>←</button>
        <h1>分析结果</h1>
      </div>

      {/* Summary */}
      <div className="result-card">
        <h2>{data.summary}</h2>
      </div>

      {/* Screenshot Types */}
      <div className="result-card">
        <h3>截图识别</h3>
        <div className="tag-list">
          {data.screenshotTypes.map((t) => (
            <span key={t} className={`tag ${t.includes("spreadsheet") ? "green" : t.includes("chat") ? "blue" : "purple"}`}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Business Objects */}
      <div className="result-card">
        <h3>业务对象</h3>
        <div className="tag-list">
          {data.businessObjects.map((o) => (
            <span key={o} className="tag gray">{o}</span>
          ))}
        </div>
      </div>

      {/* Fields */}
      <div className="result-card">
        <h3>提取字段</h3>
        <div className="code-block">
          {data.fields.map((f) => (
            <div key={f.name}>
              <span className="key">&quot;{f.name}&quot;</span>:{" "}
              <span className="str">&quot;{f.label}&quot;</span> → {f.type}
              {f.missing && <span className="warn"> ⚠ missing</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Workflow Stages */}
      <div className="result-card">
        <h3>流程阶段</h3>
        <div className="stage-flow">
          {data.workflowStages.map((s, i) => (
            <>
              {i > 0 && <span className="stage-arrow">→</span>}
              <span key={s} className="stage-item">{s}</span>
            </>
          ))}
        </div>
      </div>

      {/* Problems */}
      <div className="result-card">
        <h3 className="warn">⚠ 流程问题</h3>
        {data.problems.map((p, i) => (
          <div key={i} className="problem-item">⚠ {p}</div>
        ))}
      </div>

      {/* Automation Rules */}
      <div className="result-card">
        <h3>🔔 自动化规则建议</h3>
        {data.automationRules.map((r, i) => (
          <div key={i} className="rule-item">
            🔔 IF {r.trigger} AND {r.condition} → {r.action}
          </div>
        ))}
      </div>

      {/* Dashboard Metrics */}
      <div className="result-card">
        <h3>📊 建议仪表盘指标</h3>
        <div className="tag-list">
          {data.dashboardMetrics.map((m) => (
            <span key={m} className="tag blue">{m}</span>
          ))}
        </div>
      </div>

      {/* Implementation Plan */}
      <div className="result-card">
        <h3>实施建议</h3>
        <ol style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.8 }}>
          {data.implementationPlan.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>

      {/* Export */}
      <div className="export-bar">
        <button className="export-btn" onClick={() => exportResult("markdown")}>
          📥 Markdown 诊断报告
        </button>
        <button className="export-btn" onClick={() => exportResult("json")}>
          🔄 JSON 工作流规则
        </button>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="results-inner"><div className="loading"><div className="spinner" /></div></div>}>
      <ResultsContent />
    </Suspense>
  );
}
```

### Task 3.6: Verify frontend works

- [ ] **Step 1: Start both servers**

```bash
cd /Users/junqiliu/Desktop/IT/enterprise-flow-hub
# Terminal 1
pnpm --filter backend dev
# Terminal 2
pnpm --filter frontend dev
```

- [ ] **Step 2: Open http://localhost:3000**

Verify:
- Sidebar renders with nav items
- Main title "今天想分析什么流程？" visible
- Prompt card with attach button, textarea, submit button
- 3 quick-start cards below
- Type text + click submit → loading spinner → results page
- Results page shows all sections: summary, types, objects, fields, stages, problems, rules, metrics, plan
- Export buttons download Markdown and JSON files
- Back button returns to input view

- [ ] **Step 3: Commit**

```bash
git add frontend/app/ frontend/package.json pnpm-lock.yaml
git commit -m "feat: add Codex-style UI with analysis input and results views"
```

---

## Phase 4: Integration Polish

### Task 4.1: Add env config for API URL

**Files:**
- Create: `frontend/.env.local`

- [ ] **Step 1: Create .env.local**

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Task 4.2: Final end-to-end verify

- [ ] **Step 1: Full flow test**

```bash
# Start both services
pnpm dev
```

1. Open http://localhost:3000
2. Type "帮我减少客户漏跟进" in the textarea
3. Click submit (↑ button)
4. Verify loading spinner appears
5. Verify results page shows structured analysis
6. Click "Markdown 诊断报告" — verify .md file downloads
7. Click "JSON 工作流规则" — verify .json file downloads
8. Click "←" back — verify returns to input view

- [ ] **Step 2: Final commit**

```bash
git add frontend/.env.local
git commit -m "chore: add frontend env config for API URL"
```

---

## Verification Checklist

- [ ] `pnpm install` succeeds across all workspaces
- [ ] Backend starts and responds to `GET /health`
- [ ] `POST /analysis` returns valid AnalysisResult JSON
- [ ] `GET /analysis/:id` returns stored result
- [ ] `POST /analysis/:id/export` with `{"format":"markdown"}` returns Markdown
- [ ] `POST /analysis/:id/export` with `{"format":"json"}` returns JSON
- [ ] Frontend renders Codex-style layout (sidebar + centered main)
- [ ] Screenshot file input works (select + preview + remove)
- [ ] Submit triggers analysis and navigates to results
- [ ] Results page displays all 9 sections
- [ ] Export buttons download correct file types
- [ ] 4 git commits created (one per phase)
