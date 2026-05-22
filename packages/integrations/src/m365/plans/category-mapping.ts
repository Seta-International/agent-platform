import type { PlannerSessionScope } from '@seta/planner';
import type { GraphPlanDetails } from '../jobs/_graph-types.ts';

export interface PullCategoryMappingDeps {
  planner: {
    listLabels: (input: {
      plan_id: string;
      session: PlannerSessionScope;
    }) => Promise<Array<{ id: string; name: string; category_slot: number | null }>>;
    createLabel: (input: {
      plan_id: string;
      name: string;
      color: string;
      session: PlannerSessionScope;
    }) => Promise<{ id: string }>;
    setCategoryDescriptions: (input: {
      plan_id: string;
      slots: Record<number, { name?: string | null; label_id?: string | null }>;
      session: PlannerSessionScope;
    }) => Promise<unknown>;
  };
}

export interface PullCategoryMappingInput {
  planId: string;
  planDetails: GraphPlanDetails;
  localCategoryDescriptions: Record<string, string | null>;
  session: PlannerSessionScope;
}

export interface PullCategoryMappingResult {
  createdLabelIds: string[];
  descriptionsApplied: number;
}

export async function pullCategoryMapping(
  input: PullCategoryMappingInput,
  deps: PullCategoryMappingDeps,
): Promise<PullCategoryMappingResult> {
  const { planId, planDetails, localCategoryDescriptions, session } = input;

  const remoteCd = planDetails.categoryDescriptions ?? {};

  // Build remoteByN: Map<number, string | null> for N=1..25
  const remoteByN = new Map<number, string | null>();
  for (let n = 1; n <= 25; n++) {
    const key = `category${n}`;
    const value = Object.hasOwn(remoteCd, key) ? (remoteCd[key] ?? null) : null;
    remoteByN.set(n, value);
  }

  const existingLabels = await deps.planner.listLabels({ plan_id: planId, session });

  // Build lookup of existing labels by name (any label with this name, regardless of slot)
  const existingByName = new Map<string, string>();
  for (const label of existingLabels) {
    existingByName.set(label.name, label.id);
  }

  const createdLabelIds: string[] = [];
  const slots: Record<number, { name?: string | null; label_id?: string | null }> = {};
  let descriptionsApplied = 0;

  for (let n = 1; n <= 25; n++) {
    const remoteName = remoteByN.get(n) ?? null;
    const localKey = `category${n}`;
    const localName = Object.hasOwn(localCategoryDescriptions, localKey)
      ? (localCategoryDescriptions[localKey] ?? null)
      : null;

    if (remoteName === localName) continue; // unchanged

    if (remoteName === null) {
      slots[n] = { name: null, label_id: null };
      descriptionsApplied++;
      continue;
    }

    // remoteName is non-null — find or create a label with this name
    let labelId = existingByName.get(remoteName);
    if (!labelId) {
      const created = await deps.planner.createLabel({
        plan_id: planId,
        name: remoteName,
        color: '#9ca3af',
        session,
      });
      labelId = created.id;
      createdLabelIds.push(labelId);
      // Cache so subsequent slots reusing this name don't recreate
      existingByName.set(remoteName, labelId);
    }

    slots[n] = { name: remoteName, label_id: labelId };
    descriptionsApplied++;
  }

  if (Object.keys(slots).length > 0) {
    await deps.planner.setCategoryDescriptions({ plan_id: planId, slots, session });
  }

  return { createdLabelIds, descriptionsApplied };
}
