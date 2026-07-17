import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";

function db() { return getDb(); }

export interface RuleCondition {
  logic: "and" | "or";
  conditions: Array<
    | { field: string; op: "eq" | "neq"; value: unknown }
    | { field: string; op: "gt" | "gte" | "lt" | "lte"; value: number }
    | { field: string; op: "contains" | "not_contains"; value: string }
    | { field: string; op: "in" | "not_in"; value: unknown[] }
    | { field: string; op: "is_null" | "is_not_null" }
    | RuleCondition
  >;
}

export interface Rule {
  id: string;
  enterpriseId: string;
  name: string;
  description: string;
  objectType: string;
  triggerEvent: string;
  conditionExpr: RuleCondition;
  actionType: "notify" | "set_field" | "create_task" | "trigger_approval" | "trigger_automation";
  actionConfig: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowToRule(r: Record<string, unknown>): Rule {
  return {
    id: r.id as string,
    enterpriseId: r.enterprise_id as string,
    name: r.name as string,
    description: (r.description as string) || "",
    objectType: r.object_type as string,
    triggerEvent: r.trigger_event as string,
    conditionExpr: JSON.parse((r.condition_expr as string) || "{}"),
    actionType: r.action_type as Rule["actionType"],
    actionConfig: JSON.parse((r.action_config as string) || "{}"),
    enabled: (r.enabled as number) === 1,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function listRules(enterpriseId: string): Rule[] {
  return (db()
    .prepare("SELECT * FROM rules WHERE enterprise_id = ? ORDER BY created_at DESC")
    .all(enterpriseId) as Record<string, unknown>[])
    .map(rowToRule);
}

export function getRule(id: string): Rule | undefined {
  const row = db().prepare("SELECT * FROM rules WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToRule(row) : undefined;
}

export function createRule(input: {
  enterpriseId: string;
  name: string;
  description?: string;
  objectType: string;
  triggerEvent: string;
  conditionExpr: RuleCondition;
  actionType: Rule["actionType"];
  actionConfig?: Record<string, unknown>;
}): Rule {
  const now = new Date().toISOString();
  const rule: Rule = {
    id: `rule-${randomUUID()}`,
    enterpriseId: input.enterpriseId,
    name: input.name.trim(),
    description: input.description || "",
    objectType: input.objectType,
    triggerEvent: input.triggerEvent,
    conditionExpr: input.conditionExpr,
    actionType: input.actionType,
    actionConfig: input.actionConfig ?? {},
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
  db()
    .prepare("INSERT INTO rules (id, enterprise_id, name, description, object_type, trigger_event, condition_expr, action_type, action_config, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(rule.id, rule.enterpriseId, rule.name, rule.description, rule.objectType, rule.triggerEvent, JSON.stringify(rule.conditionExpr), rule.actionType, JSON.stringify(rule.actionConfig), 1, rule.createdAt, rule.updatedAt);
  return rule;
}

export function setRuleEnabled(id: string, enabled: boolean): Rule | undefined {
  const existing = getRule(id);
  if (!existing) return undefined;
  db().prepare("UPDATE rules SET enabled = ?, updated_at = ? WHERE id = ?").run(enabled ? 1 : 0, new Date().toISOString(), id);
  return getRule(id);
}

export function updateRule(id: string, input: {
  name?: string;
  description?: string;
  objectType?: string;
  triggerEvent?: string;
  conditionExpr?: RuleCondition;
  actionType?: Rule["actionType"];
  actionConfig?: Record<string, unknown>;
}): Rule | undefined {
  const existing = getRule(id);
  if (!existing) return undefined;
  db().prepare(
    `UPDATE rules SET name=?, description=?, object_type=?, trigger_event=?, condition_expr=?,
      action_type=?, action_config=?, updated_at=? WHERE id=?`,
  ).run(
    input.name?.trim() ?? existing.name,
    input.description !== undefined ? input.description.trim() : existing.description,
    input.objectType ?? existing.objectType,
    input.triggerEvent ?? existing.triggerEvent,
    JSON.stringify(input.conditionExpr ?? existing.conditionExpr),
    input.actionType ?? existing.actionType,
    JSON.stringify(input.actionConfig ?? existing.actionConfig),
    new Date().toISOString(),
    id,
  );
  return getRule(id);
}

export function deleteRule(id: string): boolean {
  return db().prepare("DELETE FROM rules WHERE id = ?").run(id).changes > 0;
}

// ---- Condition Evaluation ----

function evaluateSingle(obj: Record<string, unknown>, cond: RuleCondition["conditions"][number]): boolean {
  if ("logic" in cond) return evaluateCondition(obj, cond as RuleCondition);
  const c = cond as { field: string; op: string; value?: unknown };
  const val = obj[c.field];
  switch (c.op) {
    case "eq": return val === c.value;
    case "neq": return val !== c.value;
    case "gt": return typeof val === "number" && typeof c.value === "number" && val > c.value;
    case "gte": return typeof val === "number" && typeof c.value === "number" && val >= c.value;
    case "lt": return typeof val === "number" && typeof c.value === "number" && val < c.value;
    case "lte": return typeof val === "number" && typeof c.value === "number" && val <= c.value;
    case "contains": return typeof val === "string" && typeof c.value === "string" && val.includes(c.value);
    case "not_contains": return typeof val === "string" && typeof c.value === "string" && !val.includes(c.value);
    case "in": return Array.isArray(c.value) && c.value.includes(val);
    case "not_in": return Array.isArray(c.value) && !c.value.includes(val);
    case "is_null": return val === null || val === undefined || val === "";
    case "is_not_null": return val !== null && val !== undefined && val !== "";
    default: return false;
  }
}

export function evaluateCondition(obj: Record<string, unknown>, condition: RuleCondition): boolean {
  if (condition.logic === "and") return condition.conditions.every((c) => evaluateSingle(obj, c));
  if (condition.logic === "or") return condition.conditions.some((c) => evaluateSingle(obj, c));
  return condition.conditions.every((c) => evaluateSingle(obj, c));
}

export function evaluateRulesForObject(
  objectType: string,
  obj: Record<string, unknown>,
  enterpriseId: string,
): Array<{ rule: Rule; matched: boolean }> {
  const rules = listRules(enterpriseId).filter((r) => r.objectType === objectType && r.enabled);
  return rules.map((rule) => ({
    rule,
    matched: evaluateCondition(obj, rule.conditionExpr),
  }));
}
