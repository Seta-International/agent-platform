import type { DomainEvent, SubscriberCtx } from '@seta/shared-types';
import { sql } from 'drizzle-orm';

/**
 * Fields whose changes warrant re-embedding the task.
 * Changes to other mutable fields (priority, due_at, etc.) do not affect the
 * embedded text and are safely ignored.
 */
const EMBEDDED_FIELDS = new Set(['title', 'description', 'skill_tags']);

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

interface EmbedTaskJob {
  tenant_id: string;
  task_id: string;
  event_id: string;
}

/**
 * Enqueues planner.embed_task via graphile_worker.add_job inside the subscriber
 * transaction. The job uses a deterministic jobKey so rapid back-to-back events
 * for the same task collapse into a single pending job (debounce via 'replace').
 */
async function enqueueEmbedTask(tx: SubscriberCtx['tx'], job: EmbedTaskJob): Promise<void> {
  const jobKey = `planner.embed_task:${job.tenant_id}:${job.task_id}`;
  const payload = JSON.stringify(job);
  await tx.execute(
    sql`SELECT graphile_worker.add_job(
      ${'planner.embed_task'}::text,
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

export async function handleTaskCreated(
  event: DomainEvent<TaskCreatedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  await enqueueEmbedTask(ctx.tx, {
    tenant_id: event.tenantId,
    task_id: event.payload.after.task_id,
    event_id: event.id,
  });
}

export async function handleTaskUpdated(
  event: DomainEvent<TaskUpdatedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const changedFields: string[] = event.payload.changed_fields ?? [];
  if (!changedFields.some((f) => EMBEDDED_FIELDS.has(f))) return;
  await enqueueEmbedTask(ctx.tx, {
    tenant_id: event.tenantId,
    task_id: event.payload.task_id,
    event_id: event.id,
  });
}

export async function handleTaskDeleted(
  event: DomainEvent<TaskDeletedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  await enqueueEmbedTask(ctx.tx, {
    tenant_id: event.tenantId,
    task_id: event.payload.task_id,
    event_id: event.id,
  });
}
