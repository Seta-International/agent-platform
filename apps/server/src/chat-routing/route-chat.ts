import type { ChatStreamRun, RunCtx } from '@seta/shared-orchestration';
import type { ChatIntent, ClassifierHistory } from './intent-classifier.ts';

type RunStream = (
  runInput: { userText: string; taskId: string | null },
  ctx: RunCtx,
) => Promise<ChatStreamRun>;

export interface ChatRouterDeps {
  classify: (userText: string, history?: ClassifierHistory) => Promise<ChatIntent>;
  assignment: RunStream;
  plannerQuery: RunStream;
  weeklyPlanner: RunStream;
  /** A2 — the mutate intent: change a task, with a preview to confirm. */
  action: RunStream;
}

/** Composed chat runtime: classify the turn, dispatch to the matching orchestrator.
 *  Has the exact signature `registerAgent({ chatOrchestration })` expects. */
export function makeChatRouter(deps: ChatRouterDeps): RunStream {
  return async function routeChat(runInput, ctx) {
    const classifierHistory = ctx.sessionHistory?.slice(-4);
    const intent = await deps.classify(runInput.userText, classifierHistory);
    if (intent === 'assignment') return deps.assignment(runInput, ctx);
    if (intent === 'weekly_planner') return deps.weeklyPlanner(runInput, ctx);
    if (intent === 'mutate') return deps.action(runInput, ctx);
    return deps.plannerQuery(runInput, ctx);
  };
}
