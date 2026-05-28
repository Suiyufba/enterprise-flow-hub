import type { ReactNode } from "react";
import { AppIcon, type AppIconName } from "./AppIcon";

export function EmptyState({
  icon = "folder",
  title,
  description,
  action,
}: {
  icon?: AppIconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><AppIcon name={icon} /></span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
