"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

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

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const activeElement = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onCancelRef.current();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("button")?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      activeElement?.focus();
    };
  }, [loading, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="confirm-overlay" onClick={onCancel} ref={overlayRef}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message" onClick={(e) => e.stopPropagation()} ref={dialogRef}>
        <h3 id="confirm-dialog-title">{title}</h3>
        <p id="confirm-dialog-message">{message}</p>
        <div className="confirm-actions">
          <button className="page-secondary-button" onClick={onCancel} type="button" disabled={loading}>取消</button>
          <button className="page-primary-button confirm-danger-button" onClick={onConfirm} type="button" disabled={loading}>
            {loading ? "删除中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
