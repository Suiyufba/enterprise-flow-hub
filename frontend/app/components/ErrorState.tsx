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
    <div className="empty-state">
      <span className="empty-state-icon" style={{ color: "var(--c-ff3b30)" }} aria-hidden="true">
        <AppIcon name="folder" />
      </span>
      <h3 style={{ color: "var(--c-ff3b30)" }}>{message}</h3>
      {description && <p>{description}</p>}
      {onRetry && (
        <div className="empty-state-action">
          <button
            className="page-primary-button"
            onClick={onRetry}
            type="button"
            style={{ border: 0, borderRadius: "10px", fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: "10px 18px", background: "var(--c-4a90e6)", color: "#fff" }}
          >
            重试
          </button>
        </div>
      )}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
