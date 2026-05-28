"use client";

import { useState, useEffect, useRef } from "react";
import { AppIcon } from "./AppIcon";

export function SearchInput({
  value,
  onChange,
  placeholder = "搜索...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  function handleChange(v: string) {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), 300);
  }

  return (
    <div className="search-input-wrap">
      <AppIcon name="search" className="search-input-icon" />
      <input
        className="search-input-field"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
      />
      {local && (
        <button className="search-input-clear" onClick={() => handleChange("")} type="button">
          ×
        </button>
      )}
    </div>
  );
}
