import type { SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { defineAgentTool, recordEntityExposure, resolveTaskRef } from '@seta/agent-sdk';
import { z } from 'zod';
import type { CandidateUser } from '../../workflows/assign-by-skill/schemas.ts';
import { buildAssignApprovalCard } from './approval-card.ts';
import type { AssignPort, TaskAssigneesPort } from './ports.ts';
import type { Recommendation } from './schemas.ts';

/**
 * Ranks assignee candidates for a single task. Injected so this tool shares the
 * one assignBySkill engine (computeAssigneeSuggestions) with the inline
 * suggestions endpoint — group-scoped, skills from People, reasoned — instead of
 * a parallel pipeline. Test seam: unit tests stub it.
 */
export type SuggestAssignees = (input: {
  taskId: string;
  tenantId: string;
  actorUserId: string;
}) => Promise<{ task: { title: string }; candidates: CandidateUser[] }>;

export interface ProposeAssignmentDeps {
  /** Ranks candidates via the shared assignBySkill engine. */
  suggest: SuggestAssignees;
  /** Performs the assignment once the approval card is approved. */
  assign: AssignPort;
  /** The task's current assignee set — excluded from suggestions. */
  taskAssignees: TaskAssigneesPort;
  /** The orchestrator's run ctx: tenant/actor/abort. */
  ctx: SpecializedAgentRunCtx;
}

/**
 * Read off the persisted card, never off the confirm request — the same contract
 * every A2 tool uses. `.strict()` so a stale client's {decision, overrideUserIds}
 * cannot reach the writer at all.
 */
const ResumeSchema = z
  .object({
    action: z.enum(['assign', 'decline']),
    taskId: z.string(),
    assigneeUserIds: z.array(z.string()).optional(),
    idempotencyKey: z.string(),
  })
  .strict();

const SuspendSchema = z.object({ card: z.unknown() });

const InputSchema = z.object({ taskId: z.string(), title: z.string().nullable() });

const OutputSchema = z.object({
  assigned: z.boolean(),
  recommendations: z.array(z.unknown()).optional(),
});

/**
 * The deterministic single-task recommend → approve → assign composite. Runs the
 * recommend pipeline AS CODE (no LLM steps), suspends with the approval card via
 * Mastra native suspend, and on resume performs the assignment. Replaces the
 * LLM-stepped recommend chain plus the `recordApprovalIfRecommended` post-step.
 *
 * Stateless across resume by design: resume may run in a DIFFERENT process (page
 * reload) where any in-memory state is gone. The assignee set on resume comes
 * ONLY from the branch of the persisted approval card the user selected (read
 * verbatim by the resume endpoint), never from in-process memory.
 */
export function makeProposeAssignmentTool(deps: ProposeAssignmentDeps) {
  const { suggest, assign, taskAssignees, ctx } = deps;

  // Sub-agents run with the same tenant/actor. The per-turn model override rides
  // along so sub-agent LLM calls honor the user's pick.
  const subCtx: SpecializedAgentRunCtx = {
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    abortSignal: ctx.abortSignal,
    model: ctx.model,
  };

  return defineAgentTool({
    id: 'assign_proposeAssignment',
    name: 'Propose Assignment',
    description: [
      'Recommend the best assignee for a single task and ask the user to confirm the',
      'assignment. Pass the task: taskId is a task UUID, or an ordinal reference into the',
      'tasks already listed in this conversation ("first"/"#1", "second"/"#2", "last").',
      'Use this for "who should do this task" / "recommend someone for <task>". It runs the',
      'recommend pipeline and pauses for the user to approve before assigning.',
    ].join('\n'),
    input: InputSchema,
    output: OutputSchema,
    suspendSchema: SuspendSchema,
    resumeSchema: ResumeSchema,
    execute: async ({ taskId: taskRef, title }, toolCtx) => {
      // The agentic suspend/resume accessors (spike-confirmed): ctx.agent.suspend
      // and ctx.agent.resumeData. `agent` is typed optional but is always present
      // for an agentic tool invocation.
      const agent = toolCtx.agent;
      const resume = agent?.resumeData;

      // ── Resume pass: short-circuit. No pipeline re-run. ──
      if (resume) {
        // Narrowing only: defineAgentTool has already refused anything that does
        // not match `resumeSchema` before this runs.
        const decision = ResumeSchema.parse(resume);
        if (decision.action === 'decline') return { assigned: false };
        const assigneeUserIds = decision.assigneeUserIds ?? [];
        if (assigneeUserIds.length === 0) {
          // The set now ALWAYS travels on the card, so an empty one is a
          // malformed preview rather than a decision to do nothing. Failing
          // loudly beats reporting success for an assignment that never
          // happened.
          throw new Error('assign_proposeAssignment: card carried no assignees');
        }
        // Re-resolve the taskRef the same way (cheap, deterministic) so the
        // assign targets the right task even cross-process.
        const resolvedTaskId = (await resolveTaskRef(toolCtx as never, taskRef)).taskId;
        await assign.assign({
          taskId: resolvedTaskId,
          assigneeUserIds,
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          idempotencyKey: decision.idempotencyKey,
        });
        return { assigned: true };
      }

      // ── First pass: resolve the task, rank via the shared engine, suspend. ──
      const taskId = (await resolveTaskRef(toolCtx as never, taskRef)).taskId;

      // One ranking engine, shared with the inline suggestions endpoint: the
      // task's group members, skills from People, reasoned skill-fit. It already
      // group-scopes and applies the availability gate, so the only extra rule
      // here is subtracting anyone already assigned (suggesting them is noise).
      const { task, candidates } = await suggest({
        taskId,
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
      });
      const cardTitle = task.title || title;
      // Server-owned exposure tracking (thread-scoped working memory): the
      // recorder no-ops without a registered conversation memory / RC_THREAD_ID
      // and swallows its own failures — never breaks the staffing answer.
      await recordEntityExposure(toolCtx as never, {
        lastDiscussedTaskId: taskId,
        ...(task.title ? { recentTasks: [{ taskId, title: task.title }] } : {}),
      });

      const assignedIds = new Set(await taskAssignees.currentAssigneeIds(taskId, subCtx));
      const recommendations: Recommendation[] = candidates
        .filter((c) => !assignedIds.has(c.userId))
        .map((c) => {
          // Show the skills that actually matched the task, not the person's whole
          // skill list; fall back to all skills for a purely vector-based match.
          const shown = c.matchedSkills.length > 0 ? c.matchedSkills : c.skills;
          return {
            userId: c.userId,
            name: c.displayName,
            // The engine gates OOO/deactivated out, so survivors are assignable.
            status: 'available' as const,
            availabilityScore: 1,
            skillMatch: shown,
            skillMatchCount: shown.length,
            relevanceScore: c.finalScore,
            score: c.finalScore,
          };
        });
      if (recommendations.length === 0) {
        // Nothing to propose — surface the empty recommend without suspending.
        return { assigned: false, recommendations: [] };
      }
      await recordEntityExposure(toolCtx as never, {
        lastDiscussedTaskId: taskId,
        lastProposedCandidateUserId: recommendations[0]?.userId ?? null,
      });

      const card = buildAssignApprovalCard({
        taskId,
        title: cardTitle,
        recommendations,
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        // Minted HERE, on the suspend pass, and persisted on the card: resume may run
        // in a different process after a page reload, so the key can only travel via
        // the persisted proposed_payload — the same boundary assigneeUserIds crosses.
        idempotencyKey: crypto.randomUUID(),
      });
      if (typeof agent?.suspend !== 'function') {
        throw new Error('proposeAssignment: ctx.agent.suspend unavailable');
      }
      // Mastra unwinds (throws) at suspend() on the suspending pass — nothing
      // past it runs (spike-confirmed). The return is unreachable but types the tool.
      await agent.suspend({ card });
      return { assigned: false };
    },
  });
}
