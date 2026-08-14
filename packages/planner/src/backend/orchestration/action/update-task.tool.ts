import { defineAgentTool, resolveTaskRef, type SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { buildBulkApprovalCard, buildUpdateApprovalCard } from './approval-card.ts';
import { normalizeInstant } from './date-normalize.ts';
import type { ActionPorts } from './ports.ts';
import {
  dropNoOps,
  INCOMPLETE_PREVIEW,
  refuseIfPreviewOpen,
  resolveRevision,
  taskIdsFromArgsPatch,
} from './revision.ts';
import type { ActionOpenPreview } from './schemas.ts';
import {
  BULK_TARGET_CAP,
  DOMAIN_FIELD_BY_TOOL_FIELD,
  PERCENT_COMPLETE_BY_WORD,
  PRIORITY_NUMBER_BY_WORD,
  type ToolPatch,
  type UpdateTaskActionPatch,
  UpdateTaskActionPatchSchema,
  UpdateTaskResumeSchema,
  UpdateTaskSuspendSchema,
  UpdateTaskToolInputSchema,
  UpdateTaskToolOutputSchema,
} from './schemas.ts';

export interface UpdateTaskToolDeps {
  ports: ActionPorts;
  /** The orchestrator's run ctx: tenant/actor/abort. */
  ctx: SpecializedAgentRunCtx;
  /** The preview the SERVER found open for this turn, or null (FUT-840). It
   *  arrives through the run context and never through tool arguments, and the
   *  server — not the model — decides whether this call adjusts it (design D20). */
  openPreview?: ActionOpenPreview | null;
}

/** Translate the model's vocabulary into the domain's.
 *
 *  Two conversions, both deliberately in code rather than in the prompt — which
 *  is what makes them testable without an LLM:
 *   - words → stored numbers (`urgent` → 1, `in_progress` → 50);
 *   - a bare calendar day → an absolute instant, since the model may say
 *     `2026-08-15` while the domain schema requires a full offset timestamp.
 */
function toDomainPatch(patch: ToolPatch): UpdateTaskActionPatch {
  const out: Record<string, unknown> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.dueAt !== undefined) {
    out.due_at = typeof patch.dueAt === 'string' ? normalizeInstant(patch.dueAt, 'end') : null;
  }
  if (patch.startAt !== undefined) {
    out.start_at =
      typeof patch.startAt === 'string' ? normalizeInstant(patch.startAt, 'start') : null;
  }
  if (patch.priority !== undefined) out.priority_number = PRIORITY_NUMBER_BY_WORD[patch.priority];
  if (patch.status !== undefined) out.percent_complete = PERCENT_COMPLETE_BY_WORD[patch.status];
  return UpdateTaskActionPatchSchema.parse(out);
}

/**
 * Merge an adjustment onto the proposal already on the card, then remove
 * whatever the user asked to be left alone (design D3, D17).
 *
 * `{ ...previous, ...next }` and NOT a filtered merge. `toDomainPatch` already
 * distinguishes three cases on the wire: a field absent from the patch is
 * untouched, and `due_at: null` / `start_at: null` CLEAR the value. Any
 * implementation that strips null or undefined out of `next` silently drops
 * "clear this field" — the same class of silent bug as reusing the idempotency
 * key, with no error anywhere and the wrong values applied.
 *
 * Dropping happens AFTER merging, so it can remove a field the earlier preview
 * set as well as one this sentence set. It can only ever NARROW the change, which
 * is what makes it AC5-safe by construction.
 */
function mergePatches(
  previous: UpdateTaskActionPatch,
  next: UpdateTaskActionPatch,
  dropFields: readonly string[] | undefined,
): { patch: UpdateTaskActionPatch } | { refusal: string } {
  const merged: Record<string, unknown> = { ...previous, ...next };
  for (const field of dropFields ?? []) {
    const domainField = DOMAIN_FIELD_BY_TOOL_FIELD[field];
    if (!domainField) {
      return {
        refusal:
          `I don't change a field called "${field}". I can change ` +
          `${Object.keys(DOMAIN_FIELD_BY_TOOL_FIELD).join(', ')}.`,
      };
    }
    delete merged[domainField];
  }
  return { patch: merged as UpdateTaskActionPatch };
}

/**
 * The A2 Action agent's update tool: preview → confirm → gated write, over 1..20
 * tasks sharing one patch. Bulk is folded in here rather than split into a
 * separate `planner_bulkUpdate`, because two adjacent tools differing only in
 * cardinality force the model to choose with nothing in either description to
 * settle it (docs/agent/tools.md P1, P6 — design §1.3).
 *
 * Stateless across resume BY DESIGN. Resume may run in a different ECS process
 * after a page reload, so the patch, the per-target versions and the idempotency
 * key travel only inside the persisted card's argsPatch — never in memory, and
 * never from the confirmation request (FUT-804 AC5).
 */
export function makeUpdateTaskTool(deps: UpdateTaskToolDeps) {
  const { ports, ctx, openPreview } = deps;
  const actor = { tenantId: ctx.tenantId, actorUserId: ctx.actorUserId };

  return defineAgentTool({
    id: 'planner_updateTask',
    name: 'Update Task',
    description: [
      'Chat flow only — shows the user a preview card and waits for them to confirm.',
      '',
      'The user wants to change something about one or more tasks they have already',
      'identified. ONE patch is applied to EVERY task listed.',
      '',
      'Use for: "đổi tên task này thành Deploy Hiring Screen"; "push the AWS migration to',
      'next Friday"; "mark the first one as done"; "chuyển 3 task này sang done".',
      'Do NOT use to find or inspect a task — use planner_queryTasks to search and',
      'planner_getTask to read one, then pass its taskId here.',
      '',
      `At most ${BULK_TARGET_CAP} tasks per call. A larger request is REFUSED and nothing`,
      'is changed — do not work around that by calling this tool several times.',
      '',
      'Pass ONLY the fields the user actually asked to change, and resolve every relative',
      'date to an absolute one before calling. This tool never writes on its own.',
    ].join('\n'),
    input: UpdateTaskToolInputSchema,
    output: UpdateTaskToolOutputSchema,
    suspendSchema: UpdateTaskSuspendSchema,
    resumeSchema: UpdateTaskResumeSchema,
    // Declarative metadata only — `registerToolPermission` stores this in a
    // WeakMap that nothing reads at runtime, which is why the first pass calls
    // assertCanUpdateMany itself.
    rbac: 'planner.task.update',
    execute: async ({ taskRefs, patch, dropFields, correction }, toolCtx) => {
      const agent = toolCtx.agent;
      const resume = agent?.resumeData;

      // ── Resume pass ────────────────────────────────────────────────────────
      if (resume) {
        const decision = UpdateTaskResumeSchema.parse(resume);
        const taskIds = decision.targets.map((t) => t.taskId);
        if (decision.action === 'decline') {
          // No gateway call, so NO core.mutation_idempotency row exists — the
          // property FUT-840's supersede later depends on.
          return { updated: false, taskIds, refusal: null };
        }
        if (!decision.patch || !decision.idempotencyKey) {
          // A card written before this tool shipped, or a truncated payload.
          // Refuse rather than write something the user never previewed.
          return {
            updated: false,
            taskIds,
            refusal: 'This preview is incomplete. Ask me for the change again.',
          };
        }
        const result = await ports.taskUpdate.updateMany({
          ...actor,
          targets: decision.targets,
          patch: decision.patch,
          idempotencyKey: decision.idempotencyKey,
        });
        return { updated: true, taskIds: result.taskIds, refusal: null };
      }

      // ── First pass ─────────────────────────────────────────────────────────
      // 1. The cap FIRST, before any resolution: 100 refs must not become 100
      //    reads, and the refusal has to be a sentence rather than a schema error,
      //    or the model splits the request into batches — which the AC forbids.
      if (taskRefs.length > BULK_TARGET_CAP) {
        return {
          updated: false,
          taskIds: [],
          refusal:
            `I can change at most ${BULK_TARGET_CAP} tasks in one request, and this one lists ` +
            `${taskRefs.length}. Nothing was changed. Ask the user to narrow the list to ` +
            `${BULK_TARGET_CAP} or fewer — do not split it into several smaller requests.`,
        };
      }

      // 2. Resolve refs BEFORE deciding revision-or-new: the server matches the
      //    resolved tasks against the open card's tasks (design D20), so it needs
      //    them in hand. TaskRefResolveError is an AgentToolError, so wrapExecute
      //    re-throws its text verbatim and the model self-corrects against the
      //    real titles (the FUT-859 property).
      const resolvedTaskIds: string[] = [];
      for (const ref of taskRefs) {
        resolvedTaskIds.push((await resolveTaskRef(toolCtx as never, ref)).taskId);
      }
      // Two refs for one task is an unclear intent, and would double-count the
      // task in the preview.
      if (new Set(resolvedTaskIds).size !== resolvedTaskIds.length) {
        return {
          updated: false,
          taskIds: [],
          refusal:
            'Two of those references point at the same task. Say each task once and tell me ' +
            'which change you want.',
        };
      }

      const revision = await resolveRevision({
        preview: ports.preview,
        actor,
        openPreview,
        toolId: 'planner_updateTask',
        resolvedTaskIds,
      });

      let taskIds: string[];
      let normalized: UpdateTaskActionPatch;

      if (revision.kind === 'revision') {
        // Targets come FROM THE CARD; the resolved refs are ignored. This is what
        // makes "no adjustment can move the change to another task" structural
        // rather than a prompt promise (AC5.1).
        taskIds = taskIdsFromArgsPatch(revision.previousArgsPatch);
        if (taskIds.length === 0) {
          return { updated: false, taskIds: [], refusal: INCOMPLETE_PREVIEW };
        }
        const previousPatch = (revision.previousArgsPatch.patch ?? {}) as UpdateTaskActionPatch;
        const next = toDomainPatch(patch);
        const merged = mergePatches(
          previousPatch,
          next,
          dropsFor(previousPatch, next, dropFields, correction),
        );
        if ('refusal' in merged) {
          return { updated: false, taskIds: [], refusal: merged.refusal };
        }
        normalized = merged.patch;
        if (Object.keys(normalized).length === 0) {
          // Dropping every field leaves nothing to preview. The card builders
          // throw on an empty patch, so this has to be a sentence.
          return {
            updated: false,
            taskIds: [],
            refusal: 'That would leave nothing to change. Tell me what you do want changed.',
          };
        }
      } else {
        taskIds = resolvedTaskIds;
        normalized = toDomainPatch(patch);
        if (Object.keys(normalized).length === 0) {
          return {
            updated: false,
            taskIds: [],
            refusal: 'Tell me which value to set and I will show you a preview.',
          };
        }
      }

      // 5 + 6. One session for the batch, one gate per distinct group. Re-read on
      // a revision too: group membership and `version` can both change between two
      // turns, so the card must carry what is true now.
      const targets = await ports.taskRead.readMany({ ...actor, taskIds });
      await ports.taskUpdate.assertCanUpdateMany({
        ...actor,
        groupIds: targets.map((t) => t.groupId),
      });

      // A field the model echoed back off its own read is not a change the user
      // asked for. Applied AFTER the read because it needs the stored values, and
      // BEFORE the card so the user never sees a row that does nothing.
      normalized = dropNoOps(normalized, targets);
      if (Object.keys(normalized).length === 0) {
        return {
          updated: false,
          taskIds: [],
          refusal:
            targets.length === 1
              ? 'That task is already like that, so there is nothing to change.'
              : 'Those tasks are already like that, so there is nothing to change.',
        };
      }

      if (revision.kind === 'new') {
        // The mutex, as a sentence, before the model narrates anything. Skipped on
        // a revision: that card declares the same `task:` key and the writer voids
        // it in the same transaction, so checking here would refuse every
        // adjustment.
        const clash = await refuseIfPreviewOpen({ preview: ports.preview, actor, taskIds });
        if (clash) return { updated: false, taskIds: [], refusal: clash };
      }

      // Minted HERE and persisted on the card: resume may run in another process,
      // so the key can only travel via proposed_payload. FRESH on every revision —
      // reuse it and a confirm on a stale card burns the key, so the confirm on
      // the final card returns the EARLIER result as `replayed`.
      const idempotencyKey = crypto.randomUUID();
      const supersedes = revision.kind === 'revision' ? revision.previousApprovalId : undefined;
      const first = targets[0];
      const card =
        targets.length === 1 && first
          ? buildUpdateApprovalCard({
              task: first,
              patch: normalized,
              tenantId: ctx.tenantId,
              userId: ctx.actorUserId,
              idempotencyKey,
              ...(supersedes ? { supersedes } : {}),
            })
          : buildBulkApprovalCard({
              tasks: targets,
              patch: normalized,
              tenantId: ctx.tenantId,
              userId: ctx.actorUserId,
              idempotencyKey,
              ...(supersedes ? { supersedes } : {}),
            });

      if (typeof agent?.suspend !== 'function') {
        throw new Error('planner_updateTask: ctx.agent.suspend unavailable');
      }
      // Mastra unwinds (throws) at suspend() on the suspending pass — nothing
      // past this runs. The return only types the tool.
      await agent.suspend({ card });
      return { updated: false, taskIds };
    },
  });
}

/** Domain field name → the tool-facing name `mergePatches` expects in dropFields. */
const TOOL_FIELD_BY_DOMAIN_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(DOMAIN_FIELD_BY_TOOL_FIELD).map(([toolField, domainField]) => [
    domainField,
    toolField,
  ]),
);

/**
 * Which fields this adjustment removes from the proposal (design D20).
 *
 * `correction: true` means the user is narrowing the proposal, so every field the
 * previous card set and this sentence did NOT restate comes off. The model says
 * only WHETHER this is a correction — a language judgement; the server works out
 * WHICH fields, which is bookkeeping and is where the model was unreliable.
 *
 * Unioned with the model's own `dropFields`, which stays for the case correction
 * cannot express: "đừng đổi priority nữa" names a field with no value while the
 * rest of the proposal stands.
 *
 * Only ever NARROWS the change, so it is AC5-safe by construction.
 */
export function dropsFor(
  previous: UpdateTaskActionPatch,
  next: UpdateTaskActionPatch,
  dropFields: readonly string[] | undefined,
  correction: boolean | undefined,
): readonly string[] {
  const out = [...(dropFields ?? [])];
  if (correction) {
    for (const domainField of Object.keys(previous)) {
      if (domainField in next) continue;
      const toolField = TOOL_FIELD_BY_DOMAIN_FIELD[domainField];
      if (toolField && !out.includes(toolField)) out.push(toolField);
    }
  }
  return out;
}
