import type { SessionScope } from '@seta/core';
import { PlannerError, requirePermission } from '../rbac.ts';
import type { PlannerSessionScope } from './_actor.ts';
import { getGroup } from './get-group.ts';
import { updateGroup } from './update-group.ts';

interface ConflictSnapshot {
  name?: string;
  description?: string | null;
  visibility?: 'private' | 'public';
  theme?: 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';
}

export interface ResolveGroupConflictDeps {
  getLink: (groupId: string) => Promise<{
    id: string;
    lastSyncedFields: unknown;
    externalId: string;
    tenantId: string;
  } | null>;
  setSyncStatus: (linkId: string, status: 'idle') => Promise<void>;
  enqueueGroupPush: (payload: {
    tenant_id: string;
    group_id: string;
    changed_fields: string[];
  }) => Promise<void>;
}

export async function resolveGroupConflict(
  input: {
    group_id: string;
    decisions: Array<{ field: string; choice: 'local' | 'remote' }>;
    session: SessionScope;
  },
  deps: ResolveGroupConflictDeps,
): Promise<void> {
  requirePermission(input.session, 'planner.group.resolve-conflict', input.group_id);

  if (input.decisions.length === 0) {
    throw new PlannerError('VALIDATION', 'No decisions provided');
  }

  const link = await deps.getLink(input.group_id);
  if (!link) {
    throw new PlannerError('NOT_FOUND', 'Group is not linked to M365');
  }

  const snapshot = (link.lastSyncedFields ?? {}) as ConflictSnapshot;

  const remoteDecisions = input.decisions.filter((d) => d.choice === 'remote');
  const localDecisions = input.decisions.filter((d) => d.choice === 'local');

  const missingFields = remoteDecisions.filter((d) => !(d.field in snapshot));
  if (missingFields.length > 0) {
    throw new PlannerError(
      'VALIDATION',
      `Remote snapshot missing requested fields: ${missingFields.map((d) => d.field).join(', ')}`,
    );
  }

  if (remoteDecisions.length > 0) {
    const group = await getGroup({ group_id: input.group_id, session: input.session });
    const patch: Record<string, unknown> = {};
    for (const d of remoteDecisions) {
      patch[d.field as keyof ConflictSnapshot] = snapshot[d.field as keyof ConflictSnapshot];
    }
    await updateGroup({
      group_id: input.group_id,
      expected_version: group.version,
      patch,
      session: input.session as PlannerSessionScope,
    });
  }

  if (localDecisions.length > 0) {
    await deps.enqueueGroupPush({
      tenant_id: input.session.tenant_id,
      group_id: input.group_id,
      changed_fields: localDecisions.map((d) => d.field),
    });
  }

  await deps.setSyncStatus(link.id, 'idle');
}
