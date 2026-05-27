import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";

function db() { return getDb(); }

export interface BusinessEvent {
  id: string;
  eventType: string;
  objectType: string | null;
  objectId: string | null;
  payload: Record<string, unknown>;
  source: string;
  createdAt: string;
  processed: boolean;
}

type EventHandler = (event: BusinessEvent) => void | Promise<void>;

const handlers = new Map<string, EventHandler[]>();
const globalHandlers: EventHandler[] = [];

export function onEvent(eventType: string, handler: EventHandler): void {
  if (!handlers.has(eventType)) handlers.set(eventType, []);
  handlers.get(eventType)!.push(handler);
}

export function onAnyEvent(handler: EventHandler): void {
  globalHandlers.push(handler);
}

export function emitEvent(
  eventType: string,
  objectType?: string,
  objectId?: string,
  payload?: Record<string, unknown>,
  source?: string,
): BusinessEvent {
  const event: BusinessEvent = {
    id: `evt-${randomUUID()}`,
    eventType,
    objectType: objectType ?? null,
    objectId: objectId ?? null,
    payload: payload ?? {},
    source: source ?? "system",
    createdAt: new Date().toISOString(),
    processed: false,
  };
  db()
    .prepare("INSERT INTO business_events (id, event_type, object_type, object_id, payload, source, created_at, processed) VALUES (?,?,?,?,?,?,?,0)")
    .run(event.id, event.eventType, event.objectType, event.objectId, JSON.stringify(event.payload), event.source, event.createdAt);
  // Fire handlers (best-effort)
  for (const h of [...(handlers.get(eventType) ?? []), ...globalHandlers]) {
    Promise.resolve(h(event)).catch((e) => {
      console.error(`[events] Handler failed for "${eventType}":`, e instanceof Error ? e.message : e);
    });
  }
  return event;
}

export function markProcessed(id: string): void {
  db().prepare("UPDATE business_events SET processed = 1 WHERE id = ?").run(id);
}
