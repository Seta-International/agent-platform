import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import sanitizeHtml from 'sanitize-html';
import { emitPlannerTaskUpdated } from '../../events/emit-helpers.ts';
import type { TaskChangedField, TaskMutableFields } from '../../events/types.ts';
import { plans, tasks } from '../db/schema.ts';
import type { TaskRow } from '../dto.ts';
import { type UpdateTaskPatch, UpdateTaskPatchSchema } from '../inputs.ts';
import { recordTaskFieldUpdated, withSpan } from '../observability.ts';
import { PlannerError, requirePermission } from '../rbac.ts';
import { isM365SystemActor } from './_actor.ts';
import { taskRowToDto } from './_task-dto.ts';

type TaskDbRow = typeof tasks.$inferSelect;

const DESCRIPTION_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'em',
    'u',
    'del',
    'h1',
    'h2',
    'h3',
    'ul',
    'ol',
    'li',
    'a',
    'code',
    'pre',
  ],
  allowedAttributes: { a: ['href', 'rel'] },
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: 'a',
      attribs: { href: attribs.href ?? '#', rel: 'noopener noreferrer' },
    }),
  },
};

function sanitizeDescription(raw: string | null): {
  description: string | null;
  description_text: string | null;
} {
  if (raw === null) return { description: null, description_text: null };
  const description = sanitizeHtml(raw, DESCRIPTION_SANITIZE_OPTIONS);
  const description_text =
    sanitizeHtml(description, { allowedTags: [], allowedAttributes: {} }).trim() || null;
  return { description, description_text };
}

const SIMPLE_FIELDS = [
  'title',
  'description',
  'bucket_id',
  'percent_complete',
  'priority_number',
  'is_deferred',
  'preview_type',
  'order_hint',
  'assignee_priority',
  'skill_tags',
  'review_state',
] as const satisfies readonly (keyof TaskMutableFields)[];

const DATE_FIELDS = ['start_at', 'due_at'] as const satisfies readonly (keyof TaskMutableFields)[];

const EXTERNAL_FIELDS = [
  'external_source',
  'external_id',
  'external_etag',
  'external_synced_at',
] as const;

type ExternalField = (typeof EXTERNAL_FIELDS)[number];
const isExternalChangedField = (
  f: ExternalField,
): f is Exclude<ExternalField, 'external_synced_at'> & TaskChangedField =>
  f !== 'external_synced_at';

export async function updateTask(input: {
  task_id: string;
  expected_version: number;
  patch: UpdateTaskPatch;
  session: SessionScope;
}): Promise<TaskRow> {
  return withSpan(
    'planner.task.update',
    {
      'planner.tenant_id': input.session.tenant_id,
      'planner.user_id': input.session.user_id,
      'planner.task_id': input.task_id,
    },
    () => updateTaskImpl(input),
  );
}

async function updateTaskImpl(input: {
  task_id: string;
  expected_version: number;
  patch: UpdateTaskPatch;
  session: SessionScope;
}): Promise<TaskRow> {
  // Strict parse — rejects unknown keys (e.g. legacy `priority`/`progress`).
  let patch: UpdateTaskPatch;
  try {
    patch = UpdateTaskPatchSchema.parse(input.patch) as UpdateTaskPatch;
  } catch (e) {
    throw new PlannerError('VALIDATION', `Invalid updateTask patch: ${(e as Error).message}`, {
      task_id: input.task_id,
    });
  }

  const touchesExternal = EXTERNAL_FIELDS.some(
    (f) => (patch as Record<string, unknown>)[f] !== undefined,
  );
  if (touchesExternal && !isM365SystemActor(input.session)) {
    throw new PlannerError(
      'RESERVED_FOR_SYSTEM_ACTOR',
      'external_* fields writable only by M365 system actor',
      { task_id: input.task_id },
    );
  }

  let result!: TaskDbRow;

  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.task_id), isNull(tasks.deleted_at)))
        .limit(1);
      if (!existing)
        throw new PlannerError('NOT_FOUND', 'Task not found', { task_id: input.task_id });
      if (existing.tenant_id !== input.session.tenant_id) {
        throw new PlannerError('CROSS_TENANT', 'Task belongs to another tenant', {
          task_id: input.task_id,
        });
      }

      const [plan] = await tx.select().from(plans).where(eq(plans.id, existing.plan_id)).limit(1);
      if (!plan)
        throw new PlannerError('NOT_FOUND', 'Parent plan not found', {
          plan_id: existing.plan_id,
        });

      requirePermission(input.session, 'planner.task.update', plan.group_id);

      if (existing.version !== input.expected_version) {
        throw new PlannerError('CONFLICT', 'Version mismatch', {
          current_version: existing.version,
        });
      }

      const before: Partial<TaskMutableFields> = {};
      const after: Partial<TaskMutableFields> = {};
      const changed: TaskChangedField[] = [];
      const setFields: Record<string, unknown> = {
        updated_at: new Date(),
        version: existing.version + 1,
      };

      // Sanitize description and derive description_text as a coupled pair.
      // description_text is NOT in SIMPLE_FIELDS — it is only ever written here.
      let sanitizedDescriptionText: string | null | undefined;
      if ((patch as Record<string, unknown>).description !== undefined) {
        const { description, description_text } = sanitizeDescription(
          (patch as Record<string, unknown>).description as string | null,
        );
        (patch as Record<string, unknown>).description = description;
        sanitizedDescriptionText = description_text;
      }

      for (const f of SIMPLE_FIELDS) {
        const v = (patch as Record<string, unknown>)[f];
        if (v === undefined) continue;
        const exVal = (existing as unknown as Record<string, unknown>)[f];
        if (JSON.stringify(exVal) === JSON.stringify(v)) continue;
        (before as Record<string, unknown>)[f] = exVal;
        (after as Record<string, unknown>)[f] = v;
        setFields[f] = v;
        changed.push(f);
        recordTaskFieldUpdated(f);
      }

      // Explicitly write description_text when description was sanitized.
      if (sanitizedDescriptionText !== undefined) {
        const exVal = existing.description_text;
        if (JSON.stringify(exVal) !== JSON.stringify(sanitizedDescriptionText)) {
          (before as Record<string, unknown>).description_text = exVal;
          (after as Record<string, unknown>).description_text = sanitizedDescriptionText;
          setFields.description_text = sanitizedDescriptionText;
          changed.push('description_text');
          recordTaskFieldUpdated('description_text');
        }
      }

      for (const f of DATE_FIELDS) {
        const v = patch[f];
        if (v === undefined) continue;
        const exDate = (existing as unknown as Record<string, Date | null>)[f];
        const exIso = exDate ? exDate.toISOString() : null;
        const next = v ?? null;
        if (exIso === next) continue;
        (before as Record<string, unknown>)[f] = exIso;
        (after as Record<string, unknown>)[f] = next;
        setFields[f] = next ? new Date(next) : null;
        changed.push(f);
        recordTaskFieldUpdated(f);
      }

      for (const f of EXTERNAL_FIELDS) {
        const v = (patch as Record<string, unknown>)[f];
        if (v === undefined) continue;
        if (f === 'external_synced_at') {
          const exDate = existing.external_synced_at;
          const exIso = exDate ? exDate.toISOString() : null;
          const next = (v as string | null) ?? null;
          if (exIso === next) continue;
          setFields[f] = next ? new Date(next) : null;
          continue;
        }
        const exVal = (existing as unknown as Record<string, unknown>)[f];
        if (JSON.stringify(exVal) === JSON.stringify(v)) continue;
        (before as Record<string, unknown>)[f] = exVal;
        (after as Record<string, unknown>)[f] = v;
        setFields[f] = v;
        if (isExternalChangedField(f)) {
          changed.push(f);
          recordTaskFieldUpdated(f);
        }
      }

      if (changed.length === 0 && Object.keys(setFields).length === 2) {
        result = existing;
        return;
      }

      const [row] = await tx
        .update(tasks)
        .set(setFields)
        .where(eq(tasks.id, input.task_id))
        .returning();
      if (!row) throw new PlannerError('VALIDATION', 'Update returned no row');
      result = row;

      await emitPlannerTaskUpdated({
        actor: isM365SystemActor(input.session)
          ? { type: 'system', user_id: null, system_id: 'integrations.m365' }
          : { type: 'user', user_id: input.session.user_id },
        tenant_id: existing.tenant_id,
        task_id: existing.id,
        plan_id: existing.plan_id,
        group_id: plan.group_id,
        before,
        after,
        changed_fields: changed,
        version_before: existing.version,
        version_after: existing.version + 1,
      });
    },
  );

  return taskRowToDto(result);
}
