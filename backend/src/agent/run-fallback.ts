import type { ToolRun } from "shared";

type CustomerValueItem = {
  name?: string;
  contact?: string;
  completed_payment_amount?: number;
  order_amount?: number;
  order_count?: number;
  outstanding_invoice_amount?: number;
  last_order_at?: string | null;
};

function parseOutput(run: ToolRun): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(run.output) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function customerValueReply(result: Record<string, unknown>): string | undefined {
  if (result.resource !== "customer_value" || !Array.isArray(result.items)) return undefined;
  const items = result.items as CustomerValueItem[];
  if (items.length === 0) return "## 结论\n\n当前企业还没有可用于客户价值排名的数据。";
  const top = items.slice(0, 5);
  const lines = top.map((item, index) => {
    const paid = Number(item.completed_payment_amount ?? 0).toLocaleString("zh-CN");
    const ordered = Number(item.order_amount ?? 0).toLocaleString("zh-CN");
    const orders = Number(item.order_count ?? 0);
    return `${index + 1}. **${item.name || "未命名客户"}**：已回款 ¥${paid}，有效订单 ¥${ordered}，订单 ${orders} 笔`;
  });
  return [
    "## 结论",
    "",
    `按“已回款金额优先，其次有效订单金额、订单数和最近成交时间”的口径，当前最有价值的客户是 **${top[0]?.name || "未命名客户"}**。`,
    "",
    "## 客户排名",
    "",
    ...lines,
    "",
    "> 本次排名由数据库对当前企业全部客户完成聚合，不是从分页明细中抽样。",
  ].join("\n");
}

export function buildToolLimitReply(userContent: string, toolRuns: ToolRun[]): string {
  for (const run of [...toolRuns].reverse()) {
    const parsed = parseOutput(run);
    if (!parsed) continue;
    const reply = customerValueReply(parsed);
    if (reply) return reply;
  }

  const successful = toolRuns.filter((run) => run.status === "success");
  const resources = new Set<string>();
  for (const run of successful) {
    const resource = parseOutput(run)?.resource;
    if (typeof resource === "string") resources.add(resource);
  }
  return [
    "## 本轮执行已安全停止",
    "",
    `处理“${userContent.slice(0, 80)}”时达到了单轮工具调用上限，系统已阻止继续重复查询。`,
    successful.length > 0
      ? `已成功完成 ${successful.length} 次工具执行${resources.size ? `，涉及 ${[...resources].join("、")}` : ""}，但模型未在上限前生成可靠的最终结论。`
      : "本轮没有取得足够的有效数据，因此不能给出可靠结论。",
    "",
    "请重试当前问题；系统会复用聚合查询，避免再次逐页拉取数据。",
  ].join("\n");
}
