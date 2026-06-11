import type { SpecializedAgentRunCtx, SpecializedAgentSpec } from '@seta/agent-sdk';
import { defineAgentTool, recordEntityExposure, resolveTaskRef } from '@seta/agent-sdk';
import { z } from 'zod';
import { buildAssignApprovalCard } from './approval-card.ts';
import type { AssignPort } from './ports.ts';
import type {
  AvailabilityResult,
  CompletionStatus,
  RankedCandidate,
  Recommendation,
  TaskAnalyzerIntent,
  TaskAnalyzerOutput,
} from './schemas.ts';

type TaskAnalyzerSpec = SpecializedAgentSpec<
  {
    intent: TaskAnalyzerIntent;
    query: string;
    taskId: string | null;
    completionStatus: CompletionStatus;
  },
  TaskAnalyzerOutput
>;
type SkillMatcherSpec = SpecializedAgentSpec<
  { taskId: string | null; skills: string[] },
  { taskId: string | null; candidates: RankedCandidate[] }
>;
type AvaiCheckerSpec = SpecializedAgentSpec<
  { taskId: string | null; candidates: RankedCandidate[] },
  { taskId: string | null; availability: AvailabilityResult[] }
>;
type RecommenderSpec = SpecializedAgentSpec<
  {
    taskId: string | null;
    skills: string[];
    candidates: RankedCandidate[];
    availability: AvailabilityResult[];
  },
  { taskId: string | null; recommendations: Recommendation[] }
>;

export interface ProposeAssignmentDeps {
  taskAnalyzer: TaskAnalyzerSpec;
  skillMatcher: SkillMatcherSpec;
  avaiChecker: AvaiCheckerSpec;
  recommender: RecommenderSpec;
  /** Performs the assignment once the approval card is approved. */
  assign: AssignPort;
  /** The orchestrator's run ctx: tenant/actor/abort. */
  ctx: SpecializedAgentRunCtx;
}

const ResumeSchema = z.object({
  decision: z.enum(['approve', 'reject', 'modify']),
  overrideUserIds: z.array(z.string()).optional(),
  alternateIndices: z.array(z.number()).optional(),
  note: z.string().optional(),
});

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
 * ONLY from `resume.overrideUserIds` (populated by the resume endpoint from the
 * persisted approval-card row), never from in-process memory.
 */
export function makeProposeAssignmentTool(deps: ProposeAssignmentDeps) {
  const { taskAnalyzer, skillMatcher, avaiChecker, recommender, assign, ctx } = deps;

  // Sub-agents run with the same tenant/actor. The per-turn model override rides
  // along so sub-agent LLM calls honor the user's pick.
  const subCtx: SpecializedAgentRunCtx = {
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    abortSignal: ctx.abortSignal,
    model: ctx.model,
  };

  return defineAgentTool({
    id: 'staffing_proposeAssignment',
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
        if (resume.decision === 'reject') return { assigned: false };
        const assigneeUserIds = resume.overrideUserIds ?? [];
        // Defensive no-op: the resume endpoint always populates overrideUserIds
        // from the persisted card on a non-reject decision; if it is somehow
        // absent there is nothing to assign.
        if (assigneeUserIds.length === 0) return { assigned: false };
        // Re-resolve the taskRef the same way (cheap, deterministic) so the
        // assign targets the right task even cross-process.
        const resolvedTaskId = (await resolveTaskRef(toolCtx as never, taskRef)).taskId;
        await assign.assign({
          taskId: resolvedTaskId,
          assigneeUserIds,
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
        });
        return { assigned: true };
      }

      // ── First pass: resolve the task, run the recommend pipeline, suspend. ──
      const taskId = (await resolveTaskRef(toolCtx as never, taskRef)).taskId;

      // resolve_task_skills (taskAnalyzer) — its result carries skills + title.
      const analyzed = await taskAnalyzer.run(
        { intent: 'resolve_task_skills', query: title ?? '', taskId, completionStatus: 'any' },
        subCtx,
      );
      const skills = analyzed.result.skills ?? [];
      const cardTitle = analyzed.result.title ?? title;
      // Server-owned exposure tracking (thread-scoped working memory): the
      // recorder no-ops without RC_AGENT_MEMORY/RC_THREAD_ID and swallows its
      // own failures — never breaks the staffing answer.
      await recordEntityExposure(toolCtx as never, {
        lastDiscussedTaskId: taskId,
        ...(analyzed.result.title
          ? { recentTasks: [{ taskId, title: analyzed.result.title }] }
          : {}),
      });

      // skillMatcher
      const matched = await skillMatcher.run({ taskId, skills }, subCtx);

      // avaiChecker
      const avai = await avaiChecker.run({ taskId, candidates: matched.result.candidates }, subCtx);

      // recommender
      const recommended = await recommender.run(
        {
          taskId,
          skills,
          candidates: matched.result.candidates,
          availability: avai.result.availability,
        },
        subCtx,
      );

      const recommendations = recommended.result.recommendations;
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
