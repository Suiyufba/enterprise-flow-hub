import type { AgentRunEvent, AgentRunInput, AgentRunResult, AgentRuntime } from "./runtime.js";
import { runAgentKernel } from "./kernel.js";

/**
 * LegacyAgentRuntime wraps the existing in-process agent kernel.
 * Retained as the explicit fallback when Claude Code is disabled.
 */
export class LegacyAgentRuntime implements AgentRuntime {
  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const result = await runAgentKernel({
      userContent: input.userContent,
      history: input.history,
      persona: input.persona,
      skills: input.skills,
      tools: input.tools,
      provider: input.provider,
      thinkingProvider: input.thinkingProvider,
      context: input.context,
      runTool: async (toolId, toolInput, options) => {
        // Import dynamically to avoid circular deps at module level
        const { runTool } = await import("../store.js");
        return runTool(toolId, {
          // Match the Claude Code runtime: the conversation scope is authoritative.
          input: {
            ...toolInput,
            _enterpriseId: input.context.enterpriseId,
            _projectId: input.context.projectId,
            _conversationId: input.sessionId,
            _agentReason: options.reason,
          },
          dryRun: options.dryRun,
        });
      },
      maxTurns: 10,
    });

    return {
      content: result.content,
      toolRuns: result.toolRuns,
      planSteps: [], // legacy kernel doesn't produce plan steps dynamically
    };
  }

  async *runStream(input: AgentRunInput): AsyncIterable<AgentRunEvent> {
    // Legacy kernel is synchronous — emit a single "done" after completion
    try {
      yield { type: "thinking", message: "Agent is analyzing..." };
      const result = await this.run(input);
      if (result.content) {
        yield { type: "content_chunk", delta: result.content };
      }
      yield {
        type: "done",
        content: result.content,
        toolRuns: result.toolRuns,
        planSteps: result.planSteps,
      };
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async health(): Promise<{ ok: boolean; version?: string; model?: string }> {
    return { ok: true, version: "legacy", model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat" };
  }
}
