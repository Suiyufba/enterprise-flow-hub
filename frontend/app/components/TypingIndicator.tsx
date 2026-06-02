"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "../lib/gsap";

export function TypingIndicator() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!ref.current) return;
    const dots = ref.current.querySelectorAll("span");
    gsap.to(dots, {
      y: -4,
      opacity: 1,
      duration: 0.4,
      stagger: { each: 0.2, repeat: -1, yoyo: true },
      ease: "power1.inOut",
    });
  }, { scope: ref });

  return (
    <div className="chat-msg chat-msg-assistant chat-typing" aria-label="AI 正在输入..." role="status">
      <div className="chat-msg-content" ref={ref} style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.5)", opacity: 0.4 }} />
        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.5)", opacity: 0.4 }} />
        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.5)", opacity: 0.4 }} />
      </div>
    </div>
  );
}
