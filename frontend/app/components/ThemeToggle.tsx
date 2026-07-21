"use client";

import { useState, useEffect, useCallback } from "react";
import { AppIcon } from "./AppIcon";

type Theme = "dark" | "light";

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
  const [resolved, setResolved] = useState<Theme>("light");

  useEffect(() => {
    setResolved(getStoredTheme() ?? "light");
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = resolved === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("theme", next);
    setResolved(next);
  }, [resolved]);

  const isDark = resolved === "dark";

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      title={isDark ? "切换浅色模式" : "切换深色模式"}
      aria-label={isDark ? "切换浅色模式" : "切换深色模式"}
    >
      <AppIcon name={isDark ? "sun" : "moon"} />
    </button>
  );
}
