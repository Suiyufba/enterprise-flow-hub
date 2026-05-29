"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppIcon } from "./AppIcon";
import { animate, spring } from "../lib/anime";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
    if (!btnRef.current) return;
    animate(btnRef.current, {
      scale: [1, 0.85, 1.1, 1],
      duration: 400,
      ease: spring({ mass: 1, stiffness: 100, damping: 12, velocity: 0 }),
    });
  }

  return (
    <button
      ref={btnRef}
      className="msg-copy-btn"
      onClick={copy}
      type="button"
      title={copied ? "已复制" : "复制"}
    >
      <AppIcon name={copied ? "check" : "copy"} />
    </button>
  );
}

export default function MarkdownMessage({
  content,
  role,
}: {
  content: string;
  role: "user" | "assistant";
}) {
  if (role === "user") {
    return (
      <div className="chat-msg chat-msg-user">
        <div className="chat-msg-content">{content}</div>
      </div>
    );
  }

  return (
    <div className="chat-msg chat-msg-assistant">
      <div className="chat-msg-header">
        <CopyButton text={content} />
      </div>
      <div className="chat-msg-content markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
