import { randomUUID } from "node:crypto";
import type {
  AnalysisResult,
  Automation,
  CreateAutomationRequest,
  CreateLibraryItemRequest,
  CreateProjectRequest,
  Enterprise,
  LibraryItem,
  Plugin,
  Project,
  Workspace,
} from "shared";

const store = new Map<string, AnalysisResult>();

const enterprises: Enterprise[] = [
  { id: "ent-qihang", name: "启航留学" },
  { id: "ent-yunshan", name: "云杉贸易" },
];

const projects: Project[] = [
  {
    id: "proj-qihang-growth",
    enterpriseId: "ent-qihang",
    name: "线索增长",
    description: "优化线索来源、顾问跟进和签约转化。",
    createdAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
  },
  {
    id: "proj-qihang-daily",
    enterpriseId: "ent-qihang",
    name: "顾问日报",
    description: "整理顾问每日客户动作和风险提醒。",
    createdAt: new Date("2026-05-02T00:00:00.000Z").toISOString(),
  },
  {
    id: "proj-yunshan-orders",
    enterpriseId: "ent-yunshan",
    name: "订单同步",
    description: "同步订单、付款和交付状态。",
    createdAt: new Date("2026-05-03T00:00:00.000Z").toISOString(),
  },
];

const conversations = [
  {
    id: "chat-qihang-leads",
    enterpriseId: "ent-qihang",
    projectId: "proj-qihang-growth",
    title: "线索跟进诊断",
    createdAt: new Date("2026-05-12T00:00:00.000Z").toISOString(),
  },
  {
    id: "chat-qihang-daily",
    enterpriseId: "ent-qihang",
    projectId: "proj-qihang-daily",
    title: "顾问日报整理",
    createdAt: new Date("2026-05-13T00:00:00.000Z").toISOString(),
  },
  {
    id: "chat-yunshan-payments",
    enterpriseId: "ent-yunshan",
    projectId: "proj-yunshan-orders",
    title: "订单付款同步",
    createdAt: new Date("2026-05-14T00:00:00.000Z").toISOString(),
  },
  {
    id: "chat-yunshan-dashboard",
    enterpriseId: "ent-yunshan",
    projectId: "proj-yunshan-orders",
    title: "老板看板规划",
    createdAt: new Date("2026-05-15T00:00:00.000Z").toISOString(),
  },
];

const libraryItems: LibraryItem[] = [
  {
    id: "lib-qihang-leads-sheet",
    projectId: "proj-qihang-growth",
    name: "线索表截图样例",
    type: "screenshot",
    summary: "包含客户来源、顾问、阶段和最近跟进时间。",
    createdAt: new Date("2026-05-16T00:00:00.000Z").toISOString(),
  },
  {
    id: "lib-yunshan-order-sheet",
    projectId: "proj-yunshan-orders",
    name: "订单状态表",
    type: "spreadsheet",
    summary: "用于识别订单、付款、发货和签收状态。",
    createdAt: new Date("2026-05-17T00:00:00.000Z").toISOString(),
  },
];

const plugins: Plugin[] = [
  { id: "plugin-feishu", name: "飞书多维表格", description: "读取表格字段并生成流程诊断。", enabled: true },
  { id: "plugin-wecom", name: "企业微信通知", description: "把待办和风险提醒推送给负责人。", enabled: false },
  { id: "plugin-csv", name: "CSV 导入", description: "导入表格样本作为资料库素材。", enabled: true },
];

const automations: Automation[] = [
  {
    id: "auto-qihang-overdue",
    projectId: "proj-qihang-growth",
    name: "报价 3 天未跟进提醒",
    trigger: "客户进入已报价阶段 3 天后",
    action: "提醒负责顾问并记录到老板看板",
    enabled: true,
  },
  {
    id: "auto-yunshan-paid",
    projectId: "proj-yunshan-orders",
    name: "付款完成通知发货",
    trigger: "订单状态变为已付款",
    action: "通知运营安排发货",
    enabled: false,
  },
];

export function saveAnalysis(analysis: AnalysisResult): void {
  store.set(analysis.id, analysis);
}

export function getAnalysis(id: string): AnalysisResult | undefined {
  return store.get(id);
}

export function getWorkspace(): Workspace {
  return {
    enterprises,
    projects,
    conversations,
    libraryItems,
    plugins,
    automations,
  };
}

export function getProject(id: string): Project | undefined {
  return projects.find((project) => project.id === id);
}

export function createProject(input: CreateProjectRequest): Project {
  let enterprise: Enterprise | undefined;

  if (input.enterpriseId) {
    enterprise = enterprises.find((item) => item.id === input.enterpriseId);
  }

  if (!enterprise) {
    const name = input.enterpriseName?.trim() || "新企业";
    enterprise = {
      id: `ent-${randomUUID()}`,
      name,
    };
    enterprises.push(enterprise);
  }

  const project: Project = {
    id: `proj-${randomUUID()}`,
    enterpriseId: enterprise.id,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  projects.unshift(project);
  return project;
}

export function createLibraryItem(input: CreateLibraryItemRequest): LibraryItem | undefined {
  if (!getProject(input.projectId)) {
    return undefined;
  }

  const item: LibraryItem = {
    id: `lib-${randomUUID()}`,
    projectId: input.projectId,
    name: input.name.trim(),
    type: input.type,
    summary: input.summary.trim(),
    createdAt: new Date().toISOString(),
  };

  libraryItems.unshift(item);
  return item;
}

export function createAutomation(input: CreateAutomationRequest): Automation | undefined {
  if (!getProject(input.projectId)) {
    return undefined;
  }

  const automation: Automation = {
    id: `auto-${randomUUID()}`,
    projectId: input.projectId,
    name: input.name.trim(),
    trigger: input.trigger.trim(),
    action: input.action.trim(),
    enabled: true,
  };

  automations.unshift(automation);
  return automation;
}

export function setPluginEnabled(id: string, enabled: boolean): Plugin | undefined {
  const plugin = plugins.find((item) => item.id === id);
  if (!plugin) return undefined;
  plugin.enabled = enabled;
  return plugin;
}

export function setAutomationEnabled(id: string, enabled: boolean): Automation | undefined {
  const automation = automations.find((item) => item.id === id);
  if (!automation) return undefined;
  automation.enabled = enabled;
  return automation;
}
