"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { animate } from "./anime";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error";
}

interface ToastContextValue {
  showToast: (message: string, type: "success" | "error") => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

import "./toast.css";

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      const el = document.querySelector(`[data-toast-id="${id}"]`);
      if (el) {
        animate(el, {
          x: [0, 100],
          opacity: [1, 0],
          duration: 300,
          ease: "inCubic",
          onComplete: () => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
          },
        });
      } else {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            data-toast-id={t.id}
            className={`toast-item toast-${t.type}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
