import { getDb } from "../db/index.js";
import { markProcessed, onAnyEvent } from "../events/emitter.js";
import { evaluateCondition } from "../store/rules.js";
import { randomUUID } from "node:crypto";
import { notifyExecute } from "../tools/executors/notify.js";
import { runAutomationNow } from "../automation/scheduler.js";
import type { BusinessEvent } from "../events/emitter.js";

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
    const enterpriseId = typeof event.payload.enterpriseId === "string" ? event.payload.enterpriseId : "";
    if (!enterpriseId) return;

    const rows = db()
      .prepare("SELECT * FROM rules WHERE enterprise_id = ? AND object_type = ? AND trigger_event = ? AND enabled = 1")
      .all(enterpriseId, event.objectType, event.eventType) as RuleRow[];

    for (const row of rows) {
      const condition = JSON.parse(row.condition_expr || "{}");
      const matched = evaluateCondition(
        { ...event.payload, eventType: event.eventType, objectType: event.objectType, objectId: event.objectId },
        condition,
      );

      if (!matched) continue;

      try {
        await executeAction(row, event);
        console.log(`[rules] Rule "${row.name}" matched event "${event.eventType}" — action executed`);
      } catch (e) {
        console.error(`[rules] Rule "${row.name}" action failed:`, e instanceof Error ? e.message : e);
      }
    }
    markProcessed(event.id);
  });
}

async function executeAction(row: RuleRow, event: BusinessEvent): Promise<void> {
  const payload = event.payload;
  const config = JSON.parse(row.action_config || "{}");

  switch (row.action_type) {
    case "notify": {
      // Send notification via configured plugin
      const message = (config.message as string) || `规则「${row.name}」被触发`;
      const output = await notifyExecute({ pluginId: config.pluginId, message });
      const result = JSON.parse(output) as { ok?: boolean; error?: string };
      if (!result.ok) throw new Error(result.error || "通知发送失败");
      break;
    }

    case "set_field": {
      const { table, field, value } = config as Record<string, unknown>;
      if (!table || !field) throw new Error("set_field 需要 table 和 field");
      // Allowlist: only known tables and their updatable columns
      const ALLOWED: Record<string, string[]> = {
        orders: ["status"],
        customers: ["status"],
        invoices: ["status"],
        payments: ["status"],
      };
      const allowedFields = ALLOWED[table as string];
      if (!allowedFields || !allowedFields.includes(field as string)) {
        throw new Error(`规则不允许更新 ${String(table)}.${String(field)}`);
      }
      const targetId = event.objectId;
      if (!targetId) throw new Error("事件缺少 objectId");
      const hasUpdatedAt = !["invoices", "payments"].includes(table as string);
      const result = hasUpdatedAt
        ? db().prepare(`UPDATE ${table} SET ${field} = ?, updated_at = ? WHERE id = ? AND enterprise_id = ?`).run(value, new Date().toISOString(), targetId, row.enterprise_id)
        : db().prepare(`UPDATE ${table} SET ${field} = ? WHERE id = ? AND enterprise_id = ?`).run(value, targetId, row.enterprise_id);
      if (result.changes !== 1) throw new Error("规则目标记录不存在或越权");
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
          event.objectType || null,
          event.objectId || null,
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
          (objectType as string) || event.objectType || "unknown",
          (objectId as string) || event.objectId || "",
          "pending",
          new Date().toISOString(),
        );
      break;
    }

    case "trigger_automation": {
      const { automationId } = config as Record<string, unknown>;
      if (!automationId) return;
      const result = await runAutomationNow(automationId as string, {
        source: "rule",
        ruleId: row.id,
        eventType: event.eventType,
        objectType: event.objectType,
        objectId: event.objectId,
        payload,
      });
      if (!result) throw new Error("规则关联的自动化不存在或未启用");
      break;
    }
  }
}
