"use client";

import { useRef } from "react";
import type { AgentPlanStep, ToolRun } from "shared";
import { gsap, useGSAP } from "../lib/gsap";

interface AgentRunPanelProps {
  planSteps: AgentPlanStep[];
  toolRuns: ToolRun[];
  sending: boolean;
  onStop?: () => void;
  streaming?: boolean;
}

export function AgentRunPanel({ planSteps, toolRuns, sending, onStop, streaming }: AgentRunPanelProps) {
  const planRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!planRef.current) return;
    const steps = planRef.current.querySelectorAll(".agent-plan-step");
    const runningStep = Array.from(steps).find((s) =>
      s.classList.contains("agent-plan-running")
    );
    if (runningStep) {
      gsap.from(runningStep, {
        scale: 0.95,
        duration: 0.3,
        ease: "back.out(1.4)",
      });
    }
  }, { dependencies: [planSteps], scope: planRef });

  if (planSteps.length === 0 && toolRuns.length === 0) return null;

  const runningCount = planSteps.filter((s) => s.status === "running").length;
  const doneCount = planSteps.filter((s) => s.status === "done").length;

  return (
    <section className="agent-run-panel" aria-label="Agent 执行计划" ref={planRef}>
      <div className="agent-run-header">
        <div>
          <span className="agent-run-kicker">Agent Run</span>
          <h2>
            执行计划
            {streaming && <span className="agent-run-live-badge">LIVE</span>}
          </h2>
        </div>
        <div className="agent-run-header-right">
          <span className="agent-run-summary">
            {toolRuns.length > 0
              ? `${toolRuns.length} 个工具调用`
              : sending
                ? `${doneCount}/${planSteps.length} 步`
                : "已完成"}
          </span>
          {onStop && (sending || streaming) && (
            <button
              className="agent-run-stop-btn"
              onClick={onStop}
              type="button"
              aria-label="停止执行"
            >
              停止
            </button>
          )}
        </div>
      </div>

      <div className="agent-plan-list">
        {planSteps.map((step, index) => (
          <div className={`agent-plan-step agent-plan-${step.status}`} key={step.id}>
            <span className="agent-plan-index">
              {step.status === "running" ? (
                <span className="agent-plan-spinner" />
              ) : step.status === "done" ? (
                <span className="agent-plan-done-mark">OK</span>
              ) : step.status === "skipped" ? (
                <span className="agent-plan-skip-mark">—</span>
              ) : (
                index + 1
              )}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {toolRuns.length > 0 && (
        <div className="agent-tool-list">
          {toolRuns.map((tool) => (
            <div className={`agent-tool-row agent-tool-${tool.status}`} key={tool.id}>
              <strong>{tool.toolId}</strong>
              <span>{tool.status === "success" ? "成功" : "失败"}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
