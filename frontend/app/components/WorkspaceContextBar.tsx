"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { AppIcon } from "./AppIcon";

export function WorkspaceContextBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { workspace, loading } = useWorkspace();

  const conversationId = pathname.startsWith("/chat/") && pathname !== "/chat/new"
    ? pathname.split("/")[2]
    : undefined;
  const projectRouteId = pathname.startsWith("/projects/")
    ? pathname.split("/")[2]
    : undefined;
  const conversation = conversationId
    ? workspace.conversations.find((item) => item.id === conversationId)
    : undefined;
  const isScopedRoute = Boolean(conversation?.projectId || projectRouteId);
  const project = isScopedRoute
    ? workspace.projects.find((item) => item.id === (conversation?.projectId ?? projectRouteId))
    : undefined;
  const enterprise = workspace.enterprises.find((item) =>
    item.id === (project?.enterpriseId ?? user?.enterpriseId),
  ) ?? workspace.enterprises[0];
  const sectionLabels: Record<string, string> = {
    "/": "企业总览",
    "/chat/new": "选择业务范围",
    "/search": "全局搜索",
    "/library": "资料库",
    "/plugins": "插件与连接",
    "/automation": "自动化",
    "/personas": "角色人格",
    "/customers": "全部客户",
    "/suppliers": "全部供应商",
    "/products": "全部商品",
    "/orders": "全部订单",
    "/files": "全部文件",
    "/payments": "全部付款",
    "/invoices": "全部发票",
    "/tasks": "全部待办",
    "/rules": "规则引擎",
    "/enterprise": "企业管理",
    "/audit": "操作日志",
  };
  const basePath = `/${pathname.split("/").filter(Boolean)[0] ?? ""}`;
  const scopeLabel = project?.name ?? sectionLabels[pathname] ?? sectionLabels[basePath] ?? "企业工作区";

  return (
    <div className="workspace-context-bar" aria-label="当前工作范围">
      <div className="workspace-context-scope">
        <span className="workspace-context-item">
          <AppIcon name="folder" />
          <span>{loading ? "正在加载工作区" : enterprise?.name ?? "企业工作区"}</span>
        </span>
        <span className="workspace-context-divider" aria-hidden="true">/</span>
        <span className="workspace-context-item workspace-context-project">
          {scopeLabel}
        </span>
      </div>
      <div className="workspace-agent-status">
        <span className="workspace-agent-dot" />
        Agent 在线
      </div>
    </div>
  );
}
