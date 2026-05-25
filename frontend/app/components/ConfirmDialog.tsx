"use client";

import "./ConfirmDialog.css";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel = "确认删除", loading = false, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="page-secondary-button" onClick={onCancel} type="button" disabled={loading}>取消</button>
          <button className="page-primary-button" onClick={onConfirm} type="button" disabled={loading} style={{ background: "var(--c-ed6a5e)", borderColor: "var(--c-ed6a5e)" }}>
            {loading ? "删除中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
