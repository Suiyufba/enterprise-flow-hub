"use client";

import type { ReactNode } from "react";
import { AppIcon } from "./AppIcon";

export function FormDialog({
  open,
  title,
  children,
  saving = false,
  submitLabel = "保存修改",
  submitDisabled = false,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  saving?: boolean;
  submitLabel?: string;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="settings-overlay" onClick={onCancel}>
      <div className="settings-modal entity-form-dialog" role="dialog" aria-modal="true" aria-labelledby="entity-form-title" onClick={(event) => event.stopPropagation()}>
        <div className="settings-header">
          <h2 id="entity-form-title">{title}</h2>
          <button className="settings-close" onClick={onCancel} type="button" aria-label="关闭"><AppIcon name="x" /></button>
        </div>
        <div className="settings-body">
          <div className="settings-edit-form">{children}</div>
          <div className="settings-card-actions entity-form-actions">
            <button className="page-secondary-button" onClick={onCancel} disabled={saving} type="button">取消</button>
            <button className="page-primary-button" onClick={onSubmit} disabled={saving || submitDisabled} type="button">
              {saving ? "保存中..." : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
