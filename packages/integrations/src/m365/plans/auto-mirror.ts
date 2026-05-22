import type { PlannerSessionScope } from '@seta/planner';
import type { PlansGraph } from './graph.ts';
import type { M365PlanLinkRepo } from './repo.ts';

export interface RunAutoMirrorDeps {
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
  buildSystemSession: (tenantId: string) => PlannerSessionScope;
}

export interface RunAutoMirrorInput {
  tenant_id: string;
  group_id: string;
  external_group_id: string;
}

export interface RunAutoMirrorResult {
  mirrored: { plan_id: string; external_id: string; title: string }[];
  skipped: { external_id: string; reason: 'already_linked' }[];
}

export async function runAutoMirror(
  input: RunAutoMirrorInput,
  deps: RunAutoMirrorDeps,
): Promise<RunAutoMirrorResult> {
  const { tenant_id, group_id, external_group_id } = input;
  const { graph, planLinkRepo, planner, enqueuePlanPull, buildSystemSession } = deps;

  const session = buildSystemSession(tenant_id);
  const remotePlans = await graph.listGroupPlans(external_group_id);

  const mirrored: RunAutoMirrorResult['mirrored'] = [];
  const skipped: RunAutoMirrorResult['skipped'] = [];

  for (const plan of remotePlans) {
    const existing = await planLinkRepo.findByExternal(tenant_id, plan.id);
    if (existing) {
      skipped.push({ external_id: plan.id, reason: 'already_linked' });
      continue;
    }

    const created = await planner.createPlan({
      group_id,
      name: plan.title,
      external_source: 'm365',
      external_id: plan.id,
      session,
    });

    await planner.linkPlanToM365({ plan_id: created.id, external_id: plan.id, session });

    await planLinkRepo.upsert({
      tenantId: tenant_id,
      groupId: group_id,
      planId: created.id,
      externalId: plan.id,
      initialSnapshot: {},
    });

    await enqueuePlanPull({ tenant_id, plan_id: created.id, full: true });

    mirrored.push({ plan_id: created.id, external_id: plan.id, title: plan.title });
  }

  return { mirrored, skipped };
}
