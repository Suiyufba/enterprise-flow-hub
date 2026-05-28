"use client";

import { useState, useEffect, useCallback } from "react";
import { AppIcon } from "./AppIcon";

type Theme = "dark" | "light";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return null;
}

function applyTheme(theme: Theme | null) {
  if (theme) {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function ThemeToggle() {
  const [resolved, setResolved] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = getStoredTheme();
    setResolved(stored ?? getSystemTheme());

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (!getStoredTheme()) {
        setResolved(getSystemTheme());
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const currentSystem = getSystemTheme();
    const stored = getStoredTheme();

    let next: Theme | null;
    if (!stored) {
      // Following system → switch to opposite of system
      next = currentSystem === "dark" ? "light" : "dark";
    } else if (stored !== currentSystem) {
      // Already on non-system theme, switch to system (remove override)
      next = null;
    } else {
      // On system-matching stored theme → switch to opposite
      next = stored === "dark" ? "light" : "dark";
    }

    applyTheme(next);
    if (next) {
      localStorage.setItem("theme", next);
    } else {
      localStorage.removeItem("theme");
    }
    setResolved(next ?? getSystemTheme());
  }, []);

  if (!resolved) {
    return <span className="theme-toggle" />;
  }

  const isDark = resolved === "dark";

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      title={isDark ? "切换浅色模式" : "切换深色模式"}
      aria-label={isDark ? "切换浅色模式" : "切换深色模式"}
    >
      <AppIcon name={isDark ? "spark" : "moon"} />
    </button>
  );
}
