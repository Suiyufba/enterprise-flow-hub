"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const activeElement = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancelRef.current();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      activeElement?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="settings-overlay" onClick={onCancel}>
      <div ref={dialogRef} className="settings-modal entity-form-dialog" role="dialog" aria-modal="true" aria-labelledby="entity-form-title" onClick={(event) => event.stopPropagation()}>
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
    </div>,
    document.body,
  );
}
