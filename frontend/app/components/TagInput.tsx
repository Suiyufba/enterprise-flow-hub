"use client";

import { useState } from "react";
import { AppIcon } from "./AppIcon";

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "").slice(0, 30);
}

export function TagList({ tags, emptyText = "未设置" }: { tags: string[]; emptyText?: string }) {
  if (tags.length === 0) return <span className="settings-meta">{emptyText}</span>;
  return (
    <span className="entity-tags-display">
      {tags.map((tag) => <span className="entity-tag" key={tag}>{tag}</span>)}
    </span>
  );
}

export function TagInput({
  tags,
  onChange,
  placeholder = "输入标签后按回车",
  maxTags = 20,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
}) {
  const [draft, setDraft] = useState("");

  function addDraft() {
    const tag = normalizeTag(draft);
    if (!tag) {
      setDraft("");
      return;
    }
    if (!tags.includes(tag) && tags.length < maxTags) onChange([...tags, tag]);
    setDraft("");
  }

  return (
    <div className="tag-editor">
      <div className="tag-editor-list">
        {tags.map((tag) => (
          <span className="entity-tag editable" key={tag}>
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((item) => item !== tag))} aria-label={`删除标签 ${tag}`}>
              <AppIcon name="x" />
            </button>
          </span>
        ))}
        <input
          className="tag-editor-input"
          value={draft}
          maxLength={30}
          disabled={tags.length >= maxTags}
          placeholder={tags.length >= maxTags ? `最多 ${maxTags} 个标签` : placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={addDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "," || event.key === "，") {
              event.preventDefault();
              addDraft();
            }
            if (event.key === "Backspace" && !draft && tags.length > 0) onChange(tags.slice(0, -1));
          }}
        />
      </div>
      <span className="tag-editor-hint">{tags.length}/{maxTags}，每个标签最多 30 个字符</span>
    </div>
  );
}
