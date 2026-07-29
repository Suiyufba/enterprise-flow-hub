import { hostname } from "node:os";
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
type Logger = {
  info?: (obj: Record<string, unknown> | string, msg?: string) => void;
  error?: (obj: Record<string, unknown> | string, msg?: string) => void;
};

type RegisteredHandler = { key: string; handler: EventHandler };
type DeliveryRow = {
  event_id: string;
  handler_key: string;
  attempts: number;
  max_attempts: number;
  event_type: string;
  object_type: string | null;
  object_id: string | null;
  payload: string;
  source: string;
  created_at: string;
};

const handlers = new Map<string, Map<string, EventHandler>>();
const globalHandlers = new Map<string, EventHandler>();
const workerId = `${hostname()}:${process.pid}:events:${randomUUID()}`;
const leaseMs = Math.max(30_000, Number(process.env.EVENT_LEASE_MS ?? 120_000));
const pollMs = Math.max(500, Number(process.env.EVENT_POLL_MS ?? 5_000));
let draining = false;
let started = false;

export function onEvent(eventType: string, handler: EventHandler, handlerKey = `event:${eventType}:${randomUUID()}`): void {
  if (!handlers.has(eventType)) handlers.set(eventType, new Map());
  handlers.get(eventType)!.set(handlerKey, handler);
  kickEventDispatcher();
}

export function onAnyEvent(handler: EventHandler, handlerKey = `global:${randomUUID()}`): void {
  globalHandlers.set(handlerKey, handler);
  kickEventDispatcher();
}

function registeredHandlers(eventType: string): RegisteredHandler[] {
  return [
    ...Array.from(handlers.get(eventType)?.entries() ?? []).map(([key, handler]) => ({ key, handler })),
    ...Array.from(globalHandlers.entries()).map(([key, handler]) => ({ key, handler })),
  ];
}

function rowToEvent(row: DeliveryRow): BusinessEvent {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(row.payload) as Record<string, unknown>; } catch { /* keep empty payload */ }
  return {
    id: row.event_id,
    eventType: row.event_type,
    objectType: row.object_type,
    objectId: row.object_id,
    payload,
    source: row.source,
    createdAt: row.created_at,
    processed: false,
  };
}

function prepareDeliveries(): void {
  const rows = db().prepare(`
    SELECT id, event_type, created_at
    FROM business_events
    WHERE processed = 0 AND dispatch_status NOT IN ('success','dead')
    ORDER BY created_at ASC
    LIMIT 100
  `).all() as Array<{ id: string; event_type: string; created_at: string }>;
  const insert = db().prepare(`
    INSERT OR IGNORE INTO business_event_deliveries
      (event_id, handler_key, status, attempts, max_attempts, available_at, created_at, updated_at)
    VALUES (?, ?, 'pending', 0, 5, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  const transaction = db().transaction(() => {
    for (const row of rows) {
      for (const registered of registeredHandlers(row.event_type)) {
        insert.run(row.id, registered.key, row.created_at, now, now);
      }
    }
  });
  transaction.immediate();
}

function claimDelivery(): DeliveryRow | undefined {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
  const transaction = db().transaction(() => {
    const candidate = db().prepare(`
      SELECT d.event_id, d.handler_key
      FROM business_event_deliveries d
      JOIN business_events e ON e.id = d.event_id
      WHERE e.processed = 0
        AND d.status NOT IN ('success','dead')
        AND d.available_at <= ?
        AND (d.status IN ('pending','failed') OR (d.status = 'running' AND d.lease_expires_at <= ?))
      ORDER BY d.available_at ASC, d.created_at ASC
      LIMIT 1
    `).get(nowIso, nowIso) as { event_id: string; handler_key: string } | undefined;
    if (!candidate) return undefined;
    const updated = db().prepare(`
      UPDATE business_event_deliveries
      SET status='running', attempts=attempts+1, lease_owner=?, lease_expires_at=?, updated_at=?
      WHERE event_id=? AND handler_key=?
        AND status NOT IN ('success','dead')
        AND (status IN ('pending','failed') OR (status='running' AND lease_expires_at <= ?))
    `).run(workerId, leaseExpiresAt, nowIso, candidate.event_id, candidate.handler_key, nowIso);
    if (updated.changes !== 1) return undefined;
    db().prepare(`
      UPDATE business_events
      SET dispatch_status='processing', lease_owner=?, lease_expires_at=?
      WHERE id=? AND processed=0
    `).run(workerId, leaseExpiresAt, candidate.event_id);
    return db().prepare(`
      SELECT d.event_id, d.handler_key, d.attempts, d.max_attempts,
             e.event_type, e.object_type, e.object_id, e.payload, e.source, e.created_at
      FROM business_event_deliveries d
      JOIN business_events e ON e.id=d.event_id
      WHERE d.event_id=? AND d.handler_key=?
    `).get(candidate.event_id, candidate.handler_key) as DeliveryRow;
  });
  return transaction.immediate();
}

function finishEventIfComplete(eventId: string): void {
  const counts = db().prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS succeeded,
           SUM(CASE WHEN status='dead' THEN 1 ELSE 0 END) AS dead
    FROM business_event_deliveries WHERE event_id=?
  `).get(eventId) as { total: number; succeeded: number | null; dead: number | null };
  const now = new Date().toISOString();
  if (counts.total > 0 && counts.succeeded === counts.total) {
    db().prepare(`
      UPDATE business_events
      SET processed=1, dispatch_status='success', processed_at=?, lease_owner=NULL, lease_expires_at=NULL, last_error=''
      WHERE id=?
    `).run(now, eventId);
  } else if ((counts.dead ?? 0) > 0) {
    db().prepare(`
      UPDATE business_events
      SET dispatch_status='dead', lease_owner=NULL, lease_expires_at=NULL
      WHERE id=? AND processed=0
    `).run(eventId);
  }
}

async function processDelivery(delivery: DeliveryRow, logger?: Logger): Promise<void> {
  const registered = registeredHandlers(delivery.event_type).find((item) => item.key === delivery.handler_key);
  if (!registered) {
    const retryAt = new Date(Date.now() + 30_000).toISOString();
    db().prepare(`
      UPDATE business_event_deliveries
      SET status='failed', available_at=?, lease_owner=NULL, lease_expires_at=NULL,
          last_error='Handler is not registered in this process', updated_at=?
      WHERE event_id=? AND handler_key=? AND lease_owner=?
    `).run(retryAt, new Date().toISOString(), delivery.event_id, delivery.handler_key, workerId);
    return;
  }

  const heartbeat = setInterval(() => {
    const now = new Date();
    db().prepare(`
      UPDATE business_event_deliveries
      SET lease_expires_at=?, updated_at=?
      WHERE event_id=? AND handler_key=? AND status='running' AND lease_owner=?
    `).run(new Date(now.getTime() + leaseMs).toISOString(), now.toISOString(), delivery.event_id, delivery.handler_key, workerId);
  }, Math.max(5_000, Math.floor(leaseMs / 3)));
  heartbeat.unref();

  try {
    await registered.handler(rowToEvent(delivery));
    const now = new Date().toISOString();
    db().prepare(`
      UPDATE business_event_deliveries
      SET status='success', completed_at=?, updated_at=?, lease_owner=NULL, lease_expires_at=NULL, last_error=''
      WHERE event_id=? AND handler_key=? AND lease_owner=?
    `).run(now, now, delivery.event_id, delivery.handler_key, workerId);
    finishEventIfComplete(delivery.event_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const dead = delivery.attempts >= delivery.max_attempts;
    const retryDelay = Math.min(60_000, 1_000 * (2 ** Math.max(0, delivery.attempts - 1)));
    const availableAt = new Date(Date.now() + retryDelay).toISOString();
    const now = new Date().toISOString();
    db().prepare(`
      UPDATE business_event_deliveries
      SET status=?, available_at=?, updated_at=?, lease_owner=NULL, lease_expires_at=NULL, last_error=?
      WHERE event_id=? AND handler_key=? AND lease_owner=?
    `).run(dead ? 'dead' : 'failed', availableAt, now, message, delivery.event_id, delivery.handler_key, workerId);
    db().prepare(`
      UPDATE business_events
      SET dispatch_status=?, attempt_count=attempt_count+1, available_at=?, last_error=?, lease_owner=NULL, lease_expires_at=NULL
      WHERE id=? AND processed=0
    `).run(dead ? 'dead' : 'failed', availableAt, message, delivery.event_id);
    finishEventIfComplete(delivery.event_id);
    logger?.error?.({ eventId: delivery.event_id, handlerKey: delivery.handler_key, err: message }, "Business event delivery failed");
  } finally {
    clearInterval(heartbeat);
  }
}

export async function drainBusinessEvents(logger?: Logger, maxDeliveries = 25): Promise<number> {
  prepareDeliveries();
  let processed = 0;
  while (processed < maxDeliveries) {
    const delivery = claimDelivery();
    if (!delivery) break;
    await processDelivery(delivery, logger);
    processed += 1;
  }
  return processed;
}

function kickEventDispatcher(logger?: Logger): void {
  if (draining) return;
  draining = true;
  setImmediate(() => {
    void drainBusinessEvents(logger).finally(() => { draining = false; });
  });
}

export function startEventDispatcher(logger?: Logger): void {
  if (started) return;
  started = true;
  logger?.info?.({ workerId, pollMs, leaseMs }, "Durable business event dispatcher started");
  kickEventDispatcher(logger);
  const timer = setInterval(() => kickEventDispatcher(logger), pollMs);
  timer.unref();
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
  db().prepare(`
    INSERT INTO business_events
      (id,event_type,object_type,object_id,payload,source,created_at,processed,dispatch_status,attempt_count,max_attempts,available_at)
    VALUES (?,?,?,?,?,?,?,0,'pending',0,5,?)
  `).run(event.id, event.eventType, event.objectType, event.objectId, JSON.stringify(event.payload), event.source, event.createdAt, event.createdAt);
  kickEventDispatcher();
  return event;
}

export function markProcessed(id: string): void {
  const now = new Date().toISOString();
  db().prepare(`
    UPDATE business_events
    SET processed=1, dispatch_status='success', processed_at=?, lease_owner=NULL, lease_expires_at=NULL
    WHERE id=?
  `).run(now, id);
}
