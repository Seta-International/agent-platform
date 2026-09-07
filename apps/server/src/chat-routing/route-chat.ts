import type { ActionOpenPreview } from '@seta/planner/orchestration';
import type { ChatStreamRun, RunCtx } from '@seta/shared-orchestration';
import type { ChatIntent, ClassifierHistory } from './intent-classifier.ts';

type RunStream = (
  runInput: { userText: string; taskId: string | null },
  ctx: RunCtx,
) => Promise<ChatStreamRun>;

/** A2 alone receives the open preview, so only its input widens (FUT-840). The
 *  other three orchestrators keep the narrow shape. */
type ActionRunStream = (
  runInput: {
    userText: string;
    taskId: string | null;
    openPreview: ActionOpenPreview | null;
  },
  ctx: RunCtx,
) => Promise<ChatStreamRun>;

export interface ChatRouterDeps {
  classify: (userText: string, history?: ClassifierHistory) => Promise<ChatIntent>;
  assignment: RunStream;
  plannerQuery: RunStream;
  weeklyPlanner: RunStream;
  /** A2 — the mutate intent: change a task, with a preview to confirm. */
  action: ActionRunStream;
  /**
   * The newest pending A2 preview for this actor in this thread, or null.
   *
   * Injected rather than imported: the approval rows live in the `agent` schema,
   * and this is the one layer that sees both tiers. Bound to
   * `workflowIds: ['planner.action']`, which is what keeps the recommend
   * runtime's cards out of the revision loop (design D2).
   */
  findOpenPreview: (args: {
    tenantId: string;
    actorUserId: string;
    threadId: string;
  }) => Promise<ActionOpenPreview | null>;
}

/** Composed chat runtime: classify the turn, dispatch to the matching orchestrator.
 *  Has the exact signature `registerAgent({ chatOrchestration })` expects. */
export function makeChatRouter(deps: ChatRouterDeps): RunStream {
  return async function routeChat(runInput, ctx) {
    const classifierHistory = ctx.sessionHistory?.slice(-4);
    const intent = await deps.classify(runInput.userText, classifierHistory);
    if (intent === 'assignment') return deps.assignment(runInput, ctx);
    if (intent === 'weekly_planner') return deps.weeklyPlanner(runInput, ctx);
    if (intent === 'mutate') {
      // Looked up AFTER classification, and only for this branch. Classification
      // is pure text and never reads the preview (design D12), so nothing above
      // depends on it — and a read-only, weekly or recommend turn should not pay
      // for a query it cannot use.
      let openPreview: ActionOpenPreview | null = null;
      if (ctx.threadId) {
        try {
          openPreview = await deps.findOpenPreview({
            tenantId: ctx.tenantId,
            actorUserId: ctx.actorUserId,
            threadId: ctx.threadId,
          });
        } catch {
          // Degrade to "nothing open" rather than failing the turn. A2 then
          // treats the sentence as a new request and asks which task the user
          // means — the same path AC3's fourth row already describes — instead of
          // the whole chat turn 500ing on a read-model hiccup.
          openPreview = null;
        }
      }
      return deps.action({ ...runInput, openPreview }, ctx);
    }
    return deps.plannerQuery(runInput, ctx);
  };
}
