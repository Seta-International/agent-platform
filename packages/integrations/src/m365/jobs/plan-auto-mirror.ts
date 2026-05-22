import type { PlannerSessionScope } from '@seta/planner';
import { withSpan } from '../observability.ts';
import { runAutoMirror } from '../plans/auto-mirror.ts';
import type { PlansGraph } from '../plans/graph.ts';
import type { M365PlanLinkRepo } from '../plans/repo.ts';
import { buildSystemSession } from '../system-session.ts';

export interface RunPlanAutoMirrorInput {
  tenant_id: string;
  group_id: string;
  external_group_id: string;
}

export interface RunPlanAutoMirrorDeps {
  graph: PlansGraph;
  planLinkRepo: M365PlanLinkRepo;
  planner: {
    createPlan: (input: {
      group_id: string;
      name: string;
      external_source: 'm365';
      external_id: string;
      session: PlannerSessionScope;
    }) => Promise<{ id: string }>;
    linkPlanToM365: (input: {
      plan_id: string;
      external_id: string;
      session: PlannerSessionScope;
    }) => Promise<unknown>;
  };
  enqueuePlanPull: (input: { tenant_id: string; plan_id: string; full: boolean }) => Promise<void>;
}

export async function runPlanAutoMirror(
  input: RunPlanAutoMirrorInput,
  deps: RunPlanAutoMirrorDeps,
): Promise<void> {
  return withSpan(
    'm365.plan.auto-mirror',
    {
      tenant_id: input.tenant_id,
      group_id: input.group_id,
      external_group_id: input.external_group_id,
    },
    async () => {
      await runAutoMirror(
        {
          tenant_id: input.tenant_id,
          group_id: input.group_id,
          external_group_id: input.external_group_id,
        },
        {
          ...deps,
          buildSystemSession,
        },
      );
    },
  );
}
