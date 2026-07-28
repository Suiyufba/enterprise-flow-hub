import type { AgentPlanStep, ToolDefinition } from "shared";

const ATTACHMENT_BOUNDARY = "\n\n## 本轮用户附件";

export type AgentRoute = "conversation" | "tool" | "planner";

export type AgentIntent =
  | "conversation"
  | "business_query"
  | "business_action"
  | "knowledge_lookup"
  | "knowledge_write"
  | "automation"
  | "feishu"
  | "analysis";

export type AgentOrchestrationContext = {
  intent: AgentIntent;
  route: AgentRoute;
  confidence: number;
  preferredToolIds: string[];
  reason: string;
  attempt: number;
  replanReason?: string;
};

export function instructionOnly(content: string): string {
  return content.split(ATTACHMENT_BOUNDARY, 1)[0]?.trim() ?? "";
}

function containsAny(content: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(content));
}

function availableToolIds(tools: ToolDefinition[]): Set<string> {
  return new Set(tools.filter((tool) => tool.status === "enabled").map((tool) => tool.id));
}

function keepAvailable(preferred: string[], tools: ToolDefinition[]): string[] {
  const available = availableToolIds(tools);
  return preferred.filter((id) => available.has(id));
}

/**
 * Deterministic first-pass intent recognition keeps routing stable and testable.
 * The selected model still performs semantic argument extraction inside the
 * chosen Tool or Planner route.
 */
export function recognizeIntent(
  userContent: string,
  tools: ToolDefinition[],
): AgentOrchestrationContext {
  const content = instructionOnly(userContent);
  const normalized = content.toLocaleLowerCase();
  const explicitFeishu = /飞书|lark/.test(normalized);
  const attachmentWrite = containsAny(normalized, [
    /整理.*资料库/,
    /归档/,
    /存(?:到|入).*资料库/,
    /保存.*资料库/,
  ]);
  const automation = containsAny(normalized, [
    /自动化/,
    /定时/,
    /每天|每周|每月/,
    /触发器/,
    /webhook/,
  ]);
  const businessWrite = containsAny(normalized, [
    /(?:新建|创建|添加|记录|录入).*(?:客户|订单|发票|待办)/,
    /(?:修改|更新|编辑|删除|合并|去重).*(?:客户|订单|发票|待办|电话|邮箱|性别|标签|状态)/,
    /把.*(?:客户|订单|发票).*(?:记|存|录入)/,
  ]) || (
    /修改|更新|编辑|删除|合并|去重/.test(normalized)
    && /客户|订单|发票|待办|电话|邮箱|性别|标签|状态/.test(normalized)
  );
  const knowledgeLookup = containsAny(normalized, [
    /资料库/,
    /规范|规则|历史记录/,
    /知道.*(?:电话|联系方式)/,
  ]);
  const businessQuery = containsAny(normalized, [
    /客户|供应商|商品|订单|付款|回款|发票|待办/,
    /重复|逾期|最有价值|排名|总数|多少/,
  ]) && containsAny(normalized, [
    /查|找|看|列出|统计|多少|有没有|是否|分析|排名|重复|逾期/,
  ]);
  const complex = containsAny(normalized, [
    /分析|评估|比较|对比|方案|规划|设计|预测|原因|为什么|如何|风险|趋势|总结/,
    /全部|批量|综合|跨/,
  ]) || ((normalized.match(/(?:客户|订单|发票|付款|资料库|飞书)/g) ?? []).length >= 2
    && /并且|同时|然后|再|以及|和/.test(normalized));

  if (!content) {
    return {
      intent: "conversation",
      route: "conversation",
      confidence: 1,
      preferredToolIds: [],
      reason: "本轮没有可执行指令",
      attempt: 1,
    };
  }

  if (attachmentWrite) {
    return {
      intent: "knowledge_write",
      route: "tool",
      confidence: 0.98,
      preferredToolIds: keepAvailable(["tool-csv-profile", "tool-create-library-item"], tools),
      reason: "用户要求将本轮附件或内容整理到资料库",
      attempt: 1,
    };
  }

  if (explicitFeishu) {
    return {
      intent: "feishu",
      route: complex ? "planner" : "tool",
      confidence: 0.97,
      preferredToolIds: [],
      reason: complex ? "飞书请求包含多步骤分析" : "用户明确指定飞书数据源",
      attempt: 1,
    };
  }

  if (automation) {
    return {
      intent: "automation",
      route: complex ? "planner" : "tool",
      confidence: 0.94,
      preferredToolIds: keepAvailable(["tool-create-automation"], tools),
      reason: complex ? "自动化请求需要规划触发、执行与验证" : "用户要求创建或操作自动化",
      attempt: 1,
    };
  }

  if (businessWrite) {
    return {
      intent: "business_action",
      route: complex ? "planner" : "tool",
      confidence: 0.95,
      preferredToolIds: keepAvailable(
        complex ? ["tool-business-query", "tool-business-action"] : ["tool-business-action"],
        tools,
      ),
      reason: complex ? "业务写入前需要查询、校验并执行" : "单一结构化业务写入",
      attempt: 1,
    };
  }

  if (businessQuery) {
    return {
      intent: complex ? "analysis" : "business_query",
      route: complex ? "planner" : "tool",
      confidence: 0.93,
      preferredToolIds: keepAvailable(["tool-business-query"], tools),
      reason: complex ? "业务问题需要多步取数与分析" : "单一业务数据查询",
      attempt: 1,
    };
  }

  if (knowledgeLookup) {
    return {
      intent: "knowledge_lookup",
      route: complex ? "planner" : "tool",
      confidence: 0.9,
      preferredToolIds: keepAvailable(["tool-mcp-company-context", "tool-business-query"], tools),
      reason: complex ? "知识检索后还需要业务数据分析" : "查询企业或项目知识",
      attempt: 1,
    };
  }

  if (complex) {
    return {
      intent: "analysis",
      route: "planner",
      confidence: 0.82,
      preferredToolIds: [],
      reason: "请求包含分析、规划或多步骤目标",
      attempt: 1,
    };
  }

  return {
    intent: "conversation",
    route: "conversation",
    confidence: 0.78,
    preferredToolIds: [],
    reason: "一般问答，不需要业务工具",
    attempt: 1,
  };
}

export function createExecutionPlan(context: AgentOrchestrationContext): AgentPlanStep[] {
  const routeText = context.route === "tool"
    ? "简单任务，直接进入目标工具"
    : context.route === "planner"
      ? "复杂任务，先规划再执行"
      : "一般对话，直接生成回复";
  return [
    {
      id: "intent",
      title: "识别任务意图",
      detail: `${context.intent} · 置信度 ${Math.round(context.confidence * 100)}% · ${context.reason}`,
      status: "done",
    },
    {
      id: "plan",
      title: "规划执行路径",
      detail: routeText,
      status: context.route === "planner" ? "running" : "skipped",
    },
    {
      id: "execute",
      title: context.route === "tool" ? "调用目标工具" : "执行计划",
      detail: context.preferredToolIds.length
        ? `优先使用：${context.preferredToolIds.join("、")}`
        : "根据当前上下文执行",
      status: context.route === "conversation" ? "skipped" : "pending",
    },
    {
      id: "verify",
      title: "校验并生成结果",
      detail: "核对工具返回与任务目标",
      status: "pending",
    },
  ];
}

function patchStep(
  steps: AgentPlanStep[],
  id: string,
  patch: Partial<Pick<AgentPlanStep, "title" | "detail" | "status">>,
): AgentPlanStep[] {
  return steps.map((step) => step.id === id ? { ...step, ...patch } : step);
}

export function markToolCall(
  steps: AgentPlanStep[],
  toolName: string,
): AgentPlanStep[] {
  let next = steps.map((step) =>
    step.id === "plan" && step.status === "running"
      ? { ...step, status: "done" as const }
      : step
  );
  next = patchStep(next, "execute", {
    status: "running",
    detail: `正在调用 ${toolName}`,
  });
  next = patchStep(next, "verify", {
    status: "pending",
    detail: "等待本轮工具执行完成后校验",
  });
  return next;
}

export function markToolSuccess(
  steps: AgentPlanStep[],
  toolId: string,
): AgentPlanStep[] {
  return patchStep(steps, "execute", {
    status: "done",
    detail: `${toolId} 执行成功`,
  });
}

export function replanAfterFailure(
  steps: AgentPlanStep[],
  context: AgentOrchestrationContext,
  toolId: string,
  error: string,
): { steps: AgentPlanStep[]; context: AgentOrchestrationContext } {
  const detail = `${toolId} 失败：${error.slice(0, 180)}；正在根据错误调整工具或参数`;
  const withoutOldReplan = steps.filter((step) => step.id !== "replan");
  return {
    context: {
      ...context,
      route: "planner",
      attempt: context.attempt + 1,
      replanReason: detail,
    },
    steps: [
      ...patchStep(withoutOldReplan, "execute", {
        status: "pending",
        detail: "等待重规划后的下一次执行",
      }),
      {
        id: "replan",
        title: "失败重规划",
        detail,
        status: "running",
      },
    ],
  };
}

export function markRecovery(
  steps: AgentPlanStep[],
  toolId: string,
): AgentPlanStep[] {
  let next = patchStep(steps, "replan", {
    status: "done",
    detail: `已调整执行路径，并由 ${toolId} 成功恢复`,
  });
  next = patchStep(next, "execute", {
    status: "done",
    detail: `${toolId} 执行成功`,
  });
  return next;
}

export function markAnswering(steps: AgentPlanStep[]): AgentPlanStep[] {
  return patchStep(steps, "verify", {
    status: "running",
    detail: "正在核对执行结果并组织回复",
  });
}

export function finishPlan(
  steps: AgentPlanStep[],
  hadUnrecoveredFailure: boolean,
): AgentPlanStep[] {
  return steps.map((step) => {
    if (step.id === "verify") {
      return {
        ...step,
        status: "done" as const,
        detail: hadUnrecoveredFailure ? "已保留失败原因并生成可执行结论" : "已核对工具结果并完成回复",
      };
    }
    if (step.status === "running") {
      return {
        ...step,
        status: hadUnrecoveredFailure ? "skipped" as const : "done" as const,
      };
    }
    return step;
  });
}
