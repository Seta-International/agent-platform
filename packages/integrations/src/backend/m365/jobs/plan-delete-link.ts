import type { M365PlanLinkRepo } from '../plans/repo.ts';

export interface RunPlanDeleteLinkDeps {
  planLinkRepo: M365PlanLinkRepo;
}

export interface RunPlanDeleteLinkInput {
  tenant_id: string;
  trigger: 'group_unlinked' | 'plan_deleted';
  group_id?: string;
  plan_id?: string;
}

export interface RunPlanDeleteLinkResult {
  tombstoned: number;
}

export async function runPlanDeleteLink(
  input: RunPlanDeleteLinkInput,
  deps: RunPlanDeleteLinkDeps,
): Promise<RunPlanDeleteLinkResult> {
  const { planLinkRepo } = deps;

  if (input.trigger === 'group_unlinked' && input.group_id !== undefined) {
    const links = await planLinkRepo.listByGroup(input.tenant_id, input.group_id);
    for (const link of links) {
      await planLinkRepo.tombstone(link.id);
    }
    return { tombstoned: links.length };
  }

  if (input.trigger === 'plan_deleted' && input.plan_id !== undefined) {
    const link = await planLinkRepo.findByPlan(input.plan_id);
    if (link) {
      await planLinkRepo.tombstone(link.id);
      return { tombstoned: 1 };
    }
    return { tombstoned: 0 };
  }

  return { tombstoned: 0 };
}
