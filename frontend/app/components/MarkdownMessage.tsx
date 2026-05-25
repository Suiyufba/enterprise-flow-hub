"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <button
      className="msg-copy-btn"
      onClick={copy}
      type="button"
      title={copied ? "已复制" : "复制"}
    >
      {copied ? "✓" : "⎘"}
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
