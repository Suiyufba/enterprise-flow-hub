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
  const project = workspace.projects.find((item) =>
    item.id === (conversation?.projectId ?? projectRouteId),
  ) ?? workspace.projects.find((item) => item.enterpriseId === user?.enterpriseId)
    ?? workspace.projects[0];
  const enterprise = workspace.enterprises.find((item) =>
    item.id === (project?.enterpriseId ?? user?.enterpriseId),
  ) ?? workspace.enterprises[0];

  return (
    <div className="workspace-context-bar" aria-label="当前工作范围">
      <div className="workspace-context-scope">
        <span className="workspace-context-item">
          <AppIcon name="folder" />
          <span>{loading ? "正在加载工作区" : enterprise?.name ?? "企业工作区"}</span>
        </span>
        <span className="workspace-context-divider" aria-hidden="true">/</span>
        <span className="workspace-context-item workspace-context-project">
          {project?.name ?? "全部业务"}
        </span>
      </div>
      <div className="workspace-agent-status">
        <span className="workspace-agent-dot" />
        Agent 在线
      </div>
    </div>
  );
}
