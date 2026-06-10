import type { OrchestrationEvent } from '@seta/shared-orchestration';

export interface UiStreamWriter {
  write(chunk: unknown): void;
}

interface Recommendation {
  userId: string;
  name: string | null;
  skillMatch: string[];
  skillMatchCount: number;
  status: string;
}

interface TaskSummary {
  taskId: string;
  title: string;
  status: string;
  skillTags: string[];
}

interface RankedCandidate {
  userId: string;
  name: string | null;
  skills: string[];
  role: string | null;
  skillMatchCount: number;
  rank: number;
}

interface UserProfileResult {
  userId: string;
  name: string;
  role: string | null;
  skills: string[];
  availability: string;
}

interface OrchestratorResult {
  skills?: string[];
  tasks?: { task: TaskSummary; recommendations?: Recommendation[] }[];
  candidates?: RankedCandidate[];
  recommendations?: Recommendation[];
  userProfiles?: UserProfileResult[];
  pendingApproval?: { approvalId: string; taskId: string; inThread?: boolean };
  message?: string;
}

function recLine(x: Recommendation, i: number): string {
  return `${i + 1}. ${x.name ?? x.userId} — skills:${x.skillMatchCount} (${x.skillMatch.join(', ')}) · ${x.status}`;
}

function formatFinal(result: unknown): string {
  const r = (result ?? {}) as OrchestratorResult;

  // find / find+recommend
  if (Array.isArray(r.tasks)) {
    if (r.tasks.length === 0) return '\nNo matching tasks found.\n';
    const withRecs = r.tasks.filter((t) => t.recommendations).length;
    const lines = r.tasks.map((t, i) => {
      const base = `${i + 1}. ${t.task.title} [${t.task.status}] — tags: ${t.task.skillTags.join(', ') || '(none)'}`;
      if (!t.recommendations) return base;
      const people =
        t.recommendations
          .slice(0, 3)
          .map((x) => `${x.name ?? x.userId} (skills:${x.skillMatchCount})`)
          .join('; ') || 'no suitable candidates';
      return `${base}\n   → ${people}`;
    });
    const header =
      withRecs > 0 && withRecs < r.tasks.length
        ? `\nTasks (recommendations for the first ${withRecs} of ${r.tasks.length}):`
        : '\nTasks:';
    return `${header}\n${lines.join('\n')}\n`;
  }

  // recommend (single task) with an in-thread approval card: the interactive
  // card above carries the full candidate detail; the text just points at it.
  // When the reused approval lives in another thread (inThread === false)
  // there is no card above — say so instead of pointing at one.
  if (r.pendingApproval && Array.isArray(r.recommendations)) {
    const [top] = r.recommendations;
    if (top) {
      if (r.pendingApproval.inThread === false) {
        return `\nAn assignment proposal for this task is already awaiting approval — no new card was created. Top match: ${top.name ?? top.userId}.\n`;
      }
      return `\nAn assignee proposal is ready — review the approval card above. Top match: ${top.name ?? top.userId}.\n`;
    }
  }

  // recommend (single task)
  if (Array.isArray(r.recommendations)) {
    if (r.recommendations.length === 0) return '\nNo suitable candidates found.\n';
    return `\nRecommended assignees:\n${r.recommendations.slice(0, 5).map(recLine).join('\n')}\n`;
  }

  // people search (terminal at the skill matcher)
  if (Array.isArray(r.candidates)) {
    if (r.candidates.length === 0) return '\nNo matching users found.\n';
    const lines = r.candidates
      .slice(0, 5)
      .map(
        (c, i) =>
          `${i + 1}. ${c.name ?? c.userId} — skills:${c.skillMatchCount} (${c.skills.join(', ')})${c.role ? ` · ${c.role}` : ''}`,
      );
    return `\nTop matching users:\n${lines.join('\n')}\n`;
  }

  // person profile lookup
  if (Array.isArray(r.userProfiles)) {
    if (r.userProfiles.length === 0) return '\nNo matching person found.\n';
    const lines = r.userProfiles.map((p) => {
      const role = p.role ? ` · ${p.role}` : '';
      const avail = p.availability !== 'available' ? ` · ${p.availability}` : '';
      const skills = p.skills.length
        ? `\n   Skills: ${p.skills.join(', ')}`
        : '\n   Skills: (none)';
      return `${p.name}${role}${avail}${skills}`;
    });
    return `\nProfile${r.userProfiles.length > 1 ? 's' : ''}:\n${lines.join('\n')}\n`;
  }

  // describe skills
  if (Array.isArray(r.skills)) {
    return r.skills.length
      ? `\nThis task requires: ${r.skills.join(', ')}\n`
      : '\nNo specific skills are recorded for this task.\n';
  }

  return `\n${r.message ?? 'Nothing to show.'}\n`;
}

/** Wire name of the per-step trace data part the frontend renders as a timeline
 *  card. Reconciled by `id` (the stepId), so the running→done writes update one
 *  card instead of appending. Frontend: useAssistantDataUI({ name }) reads it as
 *  `{ type:'data', name:'orchestration-step', data }`. */
export const ORCHESTRATION_STEP_PART = 'orchestration-step' as const;

/** A persisted assistant-message part. Mirrors the shape the read path
 *  (`mastraPartToUIPart` in routes.ts) reconstructs and the frontend renders:
 *  one `data-orchestration-step` card per step, then the final answer text. */
export type OrchestrationAssistantPart =
  | {
      type: `data-${typeof ORCHESTRATION_STEP_PART}`;
      id: string;
      data: { stepId: string; agentId?: string; status: 'done'; trust: unknown };
    }
  | { type: 'text'; text: string };

/**
 * Maps an orchestration event stream onto AI SDK v6 UI stream chunks. Each step
 * is surfaced as a reconciled `data-orchestration-step` part carrying the full
 * TrustEnvelope (reasoning trace + citations + confidence) for the trace UI; the
 * final answer follows as one text part. Pure: the caller provides the writer
 * (the route wraps a createUIMessageStream writer; tests pass a fake).
 *
 * Returns the assistant-message parts (one done-card per step + the final text)
 * so the caller can persist the turn to Mastra memory — without persistence the
 * AUI remote-thread-list reconciles against an empty server and the streamed
 * conversation "reloads and disappears" the moment it refreshes its thread list.
 */
export async function streamOrchestrationToUI(
  writer: UiStreamWriter,
  events: AsyncIterable<OrchestrationEvent>,
  opts: {
    textId?: string;
    /** Invoked when the run suspends for HITL. Awaited inside the loop so the
     *  approval read-model row commits BEFORE the turn closes — the existing
     *  pending-approvals poll then renders the card. No UI part is emitted here;
     *  a later phase adds a `data-approval` part. */
    onApproval?: (e: Extract<OrchestrationEvent, { kind: 'approval' }>) => Promise<void>;
  } = {},
): Promise<{ assistantParts: OrchestrationAssistantPart[] }> {
  const id = opts.textId ?? 'orchestration';
  // step-done carries no agentId; remember it from step-start so the done card
  // keeps the agent label.
  const agentByStep = new Map<string, string>();
  const assistantParts: OrchestrationAssistantPart[] = [];
  let finalResult: unknown;
  // Pre-tool text: LLM acknowledgment streamed before the first tool call.
  const preId = `${id}-pre`;
  let preStarted = false;
  let preAccum = '';
  for await (const ev of events) {
    if (ev.kind === 'text') {
      // Open the pre-tool text stream on the first delta.
      if (!preStarted) {
        writer.write({ type: 'text-start', id: preId });
        preStarted = true;
      }
      writer.write({ type: 'text-delta', id: preId, delta: ev.text });
      preAccum += ev.text;
    } else if (ev.kind === 'step-start') {
      // Close pre-tool text the moment tools begin (if any was emitted).
      if (preStarted) {
        writer.write({ type: 'text-end', id: preId });
        assistantParts.push({ type: 'text', text: preAccum });
        preStarted = false;
      }
      if (ev.stepId === 'orchestrate') continue; // outer wrapper; sub-agent cards carry the trace
      agentByStep.set(ev.stepId, ev.agentId);
      writer.write({
        type: `data-${ORCHESTRATION_STEP_PART}`,
        id: ev.stepId,
        data: { stepId: ev.stepId, agentId: ev.agentId, status: 'running' },
      });
    } else if (ev.kind === 'step-done') {
      if (ev.stepId === 'orchestrate') continue;
      const data = {
        stepId: ev.stepId,
        agentId: agentByStep.get(ev.stepId),
        status: 'done' as const,
        trust: ev.trust,
      };
      writer.write({ type: `data-${ORCHESTRATION_STEP_PART}`, id: ev.stepId, data });
      assistantParts.push({ type: `data-${ORCHESTRATION_STEP_PART}`, id: ev.stepId, data });
    } else if (ev.kind === 'approval') {
      // Commit the approval read-model row before the turn closes; the existing
      // poll renders the card. A suspended turn emits no `final`, so this is the
      // only place the row gets written for this turn.
      await opts.onApproval?.(ev);
    } else if (ev.kind === 'final') {
      finalResult = ev.result;
    }
  }
  // Close pre-tool stream if tools never ran (e.g. conversational turn, no tools called).
  if (preStarted) {
    writer.write({ type: 'text-end', id: preId });
    assistantParts.push({ type: 'text', text: preAccum });
  }
  // The answer text part follows the timeline cards.
  const finalText = formatFinal(finalResult);
  writer.write({ type: 'text-start', id });
  writer.write({ type: 'text-delta', id, delta: finalText });
  writer.write({ type: 'text-end', id });
  assistantParts.push({ type: 'text', text: finalText });
  return { assistantParts };
}
