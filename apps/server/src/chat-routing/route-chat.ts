import type { ChatStreamRun, RunCtx } from '@seta/shared-orchestration';
import type { ChatIntent } from './intent-classifier.ts';

type RunStream = (
  runInput: { userText: string; taskId: string | null },
  ctx: RunCtx,
) => Promise<ChatStreamRun>;

export interface ChatRouterDeps {
  classify: (userText: string) => Promise<ChatIntent>;
  staffing: RunStream;
  plannerQna: RunStream;
  weeklyPlanner: RunStream;
}

/** Composed chat runtime: classify the turn, dispatch to the matching orchestrator.
 *  Has the exact signature `registerAgent({ chatOrchestration })` expects. */
export function makeChatRouter(deps: ChatRouterDeps): RunStream {
  return async function routeChat(runInput, ctx) {
    const intent = await deps.classify(runInput.userText);
    if (intent === 'staffing') return deps.staffing(runInput, ctx);
    if (intent === 'weekly_planner') return deps.weeklyPlanner(runInput, ctx);
    return deps.plannerQna(runInput, ctx);
  };
}
