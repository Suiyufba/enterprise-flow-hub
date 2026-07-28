import type { ToolRun } from "shared";
import {
  createExecutionPlan,
  finishPlan,
  markAnswering,
  markRecovery,
  markToolCall,
  markToolSuccess,
  recognizeIntent,
  replanAfterFailure,
} from "./architecture.js";
import type {
  AgentRunEvent,
  AgentRunInput,
  AgentRunResult,
  AgentRuntime,
} from "./runtime.js";

/**
 * Formal orchestration layer:
 * Intent Recognition -> Tool | Planner -> Executor -> MCP -> Replanner.
 *
 * The base runtime remains responsible for model reasoning and MCP argument
 * extraction. This wrapper owns routing, observable plan state and recovery.
 */
export class OrchestratedAgentRuntime implements AgentRuntime {
  constructor(private readonly base: AgentRuntime) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    let result: AgentRunResult = { content: "", toolRuns: [], planSteps: [] };
    for await (const event of this.runStream(input)) {
      if (event.type === "done") {
        result = {
          content: event.content,
          toolRuns: event.toolRuns,
          planSteps: event.planSteps,
        };
      }
      if (event.type === "error") throw new Error(event.message);
    }
    return result;
  }

  async *runStream(input: AgentRunInput): AsyncIterable<AgentRunEvent> {
    let orchestration = await recognizeIntent(input.userContent, input.tools, {
      provider: input.thinkingProvider ?? input.provider,
    });
    let planSteps = createExecutionPlan(orchestration);
    let awaitingRecovery = false;
    let answerStarted = false;
    const toolRuns: ToolRun[] = [];

    yield {
      type: "thinking",
      message: orchestration.route === "tool"
        ? `已识别为简单任务，准备直接调用${orchestration.preferredToolIds.length ? "目标工具" : "对应工具"}。`
        : orchestration.requiresConfirmation
          ? "三层意图识别置信度较低，正在向用户确认写入目标。"
        : orchestration.route === "planner"
          ? "已识别为复杂任务，正在规划执行步骤。"
          : "已识别为一般对话，正在生成回复。",
    };
    yield { type: "plan_update", planSteps };

    for await (const event of this.base.runStream({ ...input, orchestration })) {
      if (event.type === "plan_update") continue;

      if (event.type === "tool_call") {
        answerStarted = false;
        planSteps = markToolCall(planSteps, event.toolName);
        yield { type: "plan_update", planSteps };
        yield event;
        continue;
      }

      if (event.type === "tool_result") {
        if (event.status === "error") {
          const replanned = replanAfterFailure(
            planSteps,
            orchestration,
            event.toolId,
            event.output,
          );
          planSteps = replanned.steps;
          orchestration = replanned.context;
          awaitingRecovery = true;
          yield event;
          yield {
            type: "thinking",
            message: `工具 ${event.toolId} 执行失败，正在根据真实错误重新规划。`,
          };
          yield { type: "plan_update", planSteps };
          continue;
        }

        planSteps = awaitingRecovery
          ? markRecovery(planSteps, event.toolId)
          : markToolSuccess(planSteps, event.toolId);
        awaitingRecovery = false;
        yield event;
        yield { type: "plan_update", planSteps };
        continue;
      }

      if (event.type === "content_chunk") {
        if (!answerStarted) {
          answerStarted = true;
          planSteps = markAnswering(planSteps);
          yield { type: "plan_update", planSteps };
        }
        yield event;
        continue;
      }

      if (event.type === "done") {
        toolRuns.push(...event.toolRuns);
        planSteps = finishPlan(planSteps, awaitingRecovery);
        yield { type: "plan_update", planSteps };
        yield {
          ...event,
          toolRuns,
          planSteps,
        };
        continue;
      }

      yield event;
    }
  }

  health(): Promise<{ ok: boolean; version?: string; model?: string }> {
    return this.base.health();
  }
}
