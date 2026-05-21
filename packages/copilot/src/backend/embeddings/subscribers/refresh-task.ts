import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { sql } from 'drizzle-orm';

/**
 * Fields whose changes warrant re-embedding the task.
 * Changes to other mutable fields (priority, due_at, etc.) do not affect the
 * embedded text and are safely ignored.
 */
const EMBEDDED_FIELDS = new Set(['title', 'description', 'skill_tags']);

// ── Payload shapes (local types — avoids importing planner internals) ────────

interface TaskCreatedPayload {
  after: {
    task_id: string;
  };
}

interface TaskUpdatedPayload {
  task_id: string;
  changed_fields: string[];
}

interface TaskDeletedPayload {
  task_id: string;
}

type RefreshEventPayload = TaskCreatedPayload | TaskUpdatedPayload | TaskDeletedPayload;

// ── Internal job payload ─────────────────────────────────────────────────────

interface EmbedTaskJob {
  tenant_id: string;
  task_id: string;
  event_id: string;
}

// ── Shared enqueue helper ────────────────────────────────────────────────────

/**
 * Enqueues `embed_task` via graphile_worker.add_job inside the subscriber
 * transaction. The job uses a deterministic jobKey so rapid back-to-back events
 * for the same task collapse into a single pending job (debounce via 'replace').
 */
async function enqueueEmbedTask(tx: SubscriberCtx['tx'], job: EmbedTaskJob): Promise<void> {
  const jobKey = `embed_task:${job.tenant_id}:${job.task_id}`;
  const payload = JSON.stringify(job);
  await tx.execute(
    sql`SELECT graphile_worker.add_job(
      ${'embed_task'}::text,
      ${payload}::json,
      NULL::text,
      NULL::timestamp with time zone,
      ${10}::smallint,
      ${jobKey}::text,
      NULL::smallint,
      NULL::text[],
      ${'replace'}::text
    )`,
  );
}

// ── Shared handler ───────────────────────────────────────────────────────────

async function handleRefreshTask(
  event: DomainEvent<RefreshEventPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const { payload } = event;

  // Short-circuit for .updated: only embed if a text-affecting field changed.
  if (event.eventType === 'planner.task.updated') {
    const updatedPayload = payload as TaskUpdatedPayload;
    const changedFields: string[] = updatedPayload.changed_fields ?? [];
    if (!changedFields.some((f) => EMBEDDED_FIELDS.has(f))) return;
  }

  // Resolve task_id — differs across event shapes.
  let taskId: string;
  if (event.eventType === 'planner.task.created') {
    taskId = (payload as TaskCreatedPayload).after.task_id;
  } else {
    taskId = (payload as TaskUpdatedPayload | TaskDeletedPayload).task_id;
  }

  await enqueueEmbedTask(ctx.tx, {
    tenant_id: event.tenantId,
    task_id: taskId,
    event_id: event.id,
  });
}

// ── Subscriber definitions ───────────────────────────────────────────────────

export const refreshTaskCreatedSubscriber: SubscriberDef = {
  subscription: 'copilot.embeddings.refresh-task.created',
  event: 'planner.task.created',
  eventVersion: 1,
  handler: async (event, ctx) => {
    await handleRefreshTask(event as DomainEvent<RefreshEventPayload>, ctx);
  },
};

export const refreshTaskUpdatedSubscriber: SubscriberDef = {
  subscription: 'copilot.embeddings.refresh-task.updated',
  event: 'planner.task.updated',
  eventVersion: 1,
  handler: async (event, ctx) => {
    await handleRefreshTask(event as DomainEvent<RefreshEventPayload>, ctx);
  },
};

export const refreshTaskDeletedSubscriber: SubscriberDef = {
  subscription: 'copilot.embeddings.refresh-task.deleted',
  event: 'planner.task.deleted',
  eventVersion: 1,
  handler: async (event, ctx) => {
    await handleRefreshTask(event as DomainEvent<RefreshEventPayload>, ctx);
  },
};
