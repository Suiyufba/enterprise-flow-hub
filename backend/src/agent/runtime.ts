import type {
  AgentPersona,
  AgentSkill,
  Message,
  ToolDefinition,
  ToolRun,
  AgentPlanStep,
} from "shared";
import type { AgentKernelContext, AgentRuntimeProvider } from "./kernel.js";

// ── Runtime Interface ──

export interface AgentRunInput {
  userContent: string;
  history: Message[];
  persona?: AgentPersona;
  skills: AgentSkill[];
  tools: ToolDefinition[];
  provider?: AgentRuntimeProvider;
  thinkingProvider?: AgentRuntimeProvider;
  context: AgentKernelContext;
  sessionId: string;
}

export interface AgentRunResult {
  content: string;
  toolRuns: ToolRun[];
  planSteps: AgentPlanStep[];
}

export type AgentRunEvent =
  | { type: "thinking"; message: string }
  | { type: "tool_call"; toolId: string; toolName: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolId: string; status: "success" | "error"; output: string }
  | { type: "content_chunk"; delta: string }
  | { type: "plan_update"; planSteps: AgentPlanStep[] }
  | { type: "done"; content: string; toolRuns: ToolRun[]; planSteps: AgentPlanStep[] }
  | { type: "error"; message: string };

export interface AgentRuntime {
  /** Run agent synchronously, returning full result when done */
  run(input: AgentRunInput): Promise<AgentRunResult>;

  /** Run agent with streaming events */
  runStream(input: AgentRunInput): AsyncIterable<AgentRunEvent>;

  /** Check if runtime is healthy */
  health(): Promise<{ ok: boolean; version?: string; model?: string }>;
}

// ── Runtime Factory ──

let cachedRuntime: AgentRuntime | null = null;
let lastHealthCheck = 0;
const HEALTH_TTL_MS = 30_000; // cache health for 30 seconds

function isHermesEnabled(userId?: string): boolean {
  const allowedIds = (process.env.HERMES_ENABLED_USER_IDS ?? "").trim();
  if (!allowedIds) return true; // empty = all users enabled
  if (!userId) return true; // no user context → allow
  return allowedIds.split(",").map((s) => s.trim()).includes(userId);
}

export async function getRuntime(userId?: string): Promise<AgentRuntime> {
  const runtimeMode = (process.env.AGENT_RUNTIME ?? "legacy").trim();

  // Explicit legacy mode
  if (runtimeMode === "legacy") {
    return await getLegacyRuntime();
  }

  // Gradual rollout: check if this user is in the enabled list
  if (!isHermesEnabled(userId)) {
    return await getLegacyRuntime();
  }

  // Use cached runtime if health was checked recently
  const now = Date.now();
  if (cachedRuntime && now - lastHealthCheck < HEALTH_TTL_MS) {
    return cachedRuntime;
  }

  try {
    const hermes = await getHermesRuntime();
    const health = await hermes.health();
    if (health.ok) {
      cachedRuntime = hermes;
      lastHealthCheck = now;
      return hermes;
    }
  } catch {
    // Hermes unreachable — fall through to fallback
  }

  // Fallback to configured fallback runtime (default legacy)
  const fallbackMode = (process.env.AGENT_FALLBACK_RUNTIME ?? "legacy").trim();
  if (cachedRuntime && fallbackMode === "hermes") {
    // If fallback is hermes but it failed, try legacy
    return await getLegacyRuntime();
  }
  cachedRuntime = null;
  return await getLegacyRuntime();
}

/** Reset cached runtime (called after Hermes recovers or config changes) */
export function resetRuntimeCache(): void {
  cachedRuntime = null;
  lastHealthCheck = 0;
}

// ── Lazy imports to avoid circular deps (ESM-compatible dynamic import) ──

async function getLegacyRuntime(): Promise<AgentRuntime> {
  const { LegacyAgentRuntime } = await import("./legacy-runtime.js");
  return new LegacyAgentRuntime();
}

async function getHermesRuntime(): Promise<AgentRuntime> {
  const { HermesAgentRuntime } = await import("./hermes-runtime.js");
  return new HermesAgentRuntime();
}
