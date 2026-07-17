import type { ReactNode } from "react";
import { AppIcon } from "./AppIcon";

export function ErrorState({
  message = "加载失败",
  description = "请检查网络连接后重试",
  onRetry,
  action,
}: {
  message?: string;
  description?: string;
  onRetry?: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state error-state" role="alert">
      <span className="empty-state-icon" aria-hidden="true">
        <AppIcon name="alert" />
      </span>
      <h3>{message}</h3>
      {description && <p>{description}</p>}
      {onRetry && (
        <div className="empty-state-action">
          <button
            className="page-primary-button"
            onClick={onRetry}
            type="button"
          >
            重试
          </button>
        </div>
      )}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
