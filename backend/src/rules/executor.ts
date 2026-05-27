import { getDb } from "../db/index.js";
import { onAnyEvent } from "../events/emitter.js";
import { evaluateCondition } from "../store/rules.js";
import { getNotificationWebhook } from "../store.js";
import { randomUUID } from "node:crypto";

function db() { return getDb(); }

interface RuleRow {
  id: string;
  enterprise_id: string;
  name: string;
  object_type: string;
  trigger_event: string;
  condition_expr: string;
  action_type: string;
  action_config: string;
  enabled: number;
}

export function setupRulesExecutor(): void {
  onAnyEvent(async (event) => {
    if (!event.objectType) return;

    const rows = db()
      .prepare("SELECT * FROM rules WHERE object_type = ? AND trigger_event = ? AND enabled = 1")
      .all(event.objectType, event.eventType) as RuleRow[];

    for (const row of rows) {
      const condition = JSON.parse(row.condition_expr || "{}");
      const matched = evaluateCondition(
        { ...event.payload, eventType: event.eventType, objectType: event.objectType, objectId: event.objectId },
        condition,
      );

      if (!matched) continue;

      try {
        await executeAction(row, event.payload);
        console.log(`[rules] Rule "${row.name}" matched event "${event.eventType}" — action executed`);
      } catch (e) {
        console.error(`[rules] Rule "${row.name}" action failed:`, e instanceof Error ? e.message : e);
      }
    }
  });
}

async function executeAction(row: RuleRow, payload: Record<string, unknown>): Promise<void> {
  const config = JSON.parse(row.action_config || "{}");

  switch (row.action_type) {
    case "notify": {
      // Send notification via configured plugin
      const webhook = getNotificationWebhook();
      if (!webhook) { console.warn("[rules] No notification plugin configured"); return; }
      const message = (config.message as string) || `规则「${row.name}」被触发`;
      await fetch(webhook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msg_type: "text",
          content: { text: message },
        }),
      });
      break;
    }

    case "set_field": {
      const { table, field, value, objectId } = config as Record<string, unknown>;
      if (!table || !field || !objectId) return;
      const targetId = objectId === "$event.objectId" ? payload.objectId ?? payload.id : objectId;
      if (!targetId) return;
      db()
        .prepare(`UPDATE ${table} SET ${field} = ?, updated_at = ? WHERE id = ?`)
        .run(value, new Date().toISOString(), targetId);
      break;
    }

    case "create_task": {
      const { title, assigneeId, priority } = config as Record<string, unknown>;
      db()
        .prepare("INSERT INTO tasks (id, enterprise_id, assignee_id, title, status, priority, source_type, source_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .run(
          `task-${randomUUID()}`,
          row.enterprise_id,
          (assigneeId as string) || null,
          (title as string) || `规则「${row.name}」自动创建`,
          "pending",
          (priority as string) || "medium",
          payload.objectType || null,
          (payload.objectId as string) || null,
          new Date().toISOString(),
          new Date().toISOString(),
        );
      break;
    }

    case "trigger_approval": {
      const { approverId, objectType, objectId } = config as Record<string, unknown>;
      db()
        .prepare("INSERT INTO approvals (id, enterprise_id, approver_id, object_type, object_id, status, created_at) VALUES (?,?,?,?,?,?,?)")
        .run(
          `apr-${randomUUID()}`,
          row.enterprise_id,
          (approverId as string) || null,
          (objectType as string) || payload.objectType || "unknown",
          (objectId as string) || payload.objectId || "",
          "pending",
          new Date().toISOString(),
        );
      break;
    }

    case "trigger_automation": {
      const { automationId } = config as Record<string, unknown>;
      if (!automationId) return;
      const auto = db().prepare("SELECT * FROM automations WHERE id = ? AND enabled = 1").get(automationId) as Record<string, unknown> | undefined;
      if (!auto) return;
      // Fire webhook or AI call based on automation config
      if (auto.action_type === "api_call") {
        fetch(auto.action_desc as string, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        }).catch(() => {});
      }
      db()
        .prepare("UPDATE automations SET run_count = run_count + 1, last_run = ? WHERE id = ?")
        .run(new Date().toISOString(), automationId);
      break;
    }
  }
}
