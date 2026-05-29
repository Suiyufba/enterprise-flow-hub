"use client";

import { useEffect, useRef } from "react";
import { animate, spring } from "../lib/anime";
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
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !overlayRef.current || !dialogRef.current) return;
    animate(overlayRef.current, {
      opacity: [0, 1],
      duration: 250,
      ease: "outCubic",
    });
    animate(dialogRef.current, {
      scale: [0.9, 1],
      y: [10, 0],
      opacity: [0, 1],
      duration: 500,
      ease: spring({ mass: 1, stiffness: 80, damping: 12, velocity: 0 }),
    });
  }, [open]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" onClick={onCancel} ref={overlayRef}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} ref={dialogRef}>
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
