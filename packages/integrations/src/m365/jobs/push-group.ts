import { emit, withEmit } from '@seta/core/events';
import { getGroup, markGroupSyncStatus, type UpdateGroupPatch, updateGroup } from '@seta/planner';
import { resolveField } from '../lww.ts';
import type { M365GroupLinkRepo } from '../repo.ts';
import { type SyncSnapshot, snapshotFromGraph } from '../snapshot.ts';
import { buildSystemSession } from '../system-session.ts';
import type { GraphLikeReadPatch } from './_graph-types.ts';

export type GraphLike = GraphLikeReadPatch;

export interface RunPushGroupInput {
  tenant_id: string;
  group_id: string;
  /** Fields the local update touched — advisory hint that scopes LWW evaluation. */
  changed_fields: string[];
}

export interface RunPushGroupDeps {
  graphClient: GraphLike;
  repo: M365GroupLinkRepo;
}

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

interface GraphGroupResponse {
  id?: string;
  displayName?: string;
  description?: string;
  visibility?: string;
  theme?: string;
}

interface GraphMember {
  id: string;
}

interface GraphMembersResponse {
  value: GraphMember[];
}

/** Maps Seta scalar field names to Graph property names for outbound PATCH. */
const FIELD_TO_GRAPH: Record<string, (value: string | null) => Record<string, unknown>> = {
  name: (v) => ({ displayName: v }),
  description: (v) => ({ description: v }),
  visibility: (v) => ({
    // Graph expects title-cased visibility
    visibility: v === 'public' ? 'Public' : v === 'private' ? 'Private' : v,
  }),
  theme: (v) => ({ theme: v }),
};

export async function runPushGroup(
  input: RunPushGroupInput,
  deps: RunPushGroupDeps,
): Promise<void> {
  const { tenant_id, group_id, changed_fields } = input;
  const { graphClient, repo } = deps;

  const session = buildSystemSession(tenant_id);

  // Step 2: Find link — return early if no active link
  const link = await repo.findByGroup(group_id);
  if (!link) return;

  await repo.setSyncStatus(link.id, 'pushing');

  try {
    const external_id = link.externalId;

    // Step 3: Re-fetch remote group + members
    const remoteGroup = (await graphClient
      .api(`/groups/${external_id}`)
      .select('displayName', 'description', 'visibility', 'theme')
      .get()) as GraphGroupResponse;

    const membersResp = (await graphClient
      .api(`/groups/${external_id}/members`)
      .get()) as GraphMembersResponse;
    const ownersResp = (await graphClient
      .api(`/groups/${external_id}/owners`)
      .get()) as GraphMembersResponse;

    const ownerOids = new Set((ownersResp.value ?? []).map((o) => o.id));
    const remoteMemberRefs = (membersResp.value ?? []).map((m) => ({
      entra_oid: m.id,
      role: (ownerOids.has(m.id) ? 'owner' : 'member') as 'owner' | 'member',
    }));

    // Step 4: Build remote snapshot
    const remoteSnapshot = snapshotFromGraph(
      {
        displayName: remoteGroup.displayName,
        description: remoteGroup.description,
        visibility: remoteGroup.visibility,
        theme: remoteGroup.theme,
      },
      remoteMemberRefs,
    );

    // Step 5: Load local group
    const localGroup = await getGroup({ group_id, session });

    // Step 8: Load baseline snapshot
    const baselineFields = link.lastSyncedFields as Partial<SyncSnapshot> | null;
    const isFirstRun = !baselineFields || Object.keys(baselineFields).length === 0;
    const snapshot: SyncSnapshot = isFirstRun
      ? remoteSnapshot
      : {
          name: (baselineFields as SyncSnapshot).name ?? remoteSnapshot.name,
          description: (baselineFields as SyncSnapshot).description ?? null,
          visibility: (baselineFields as SyncSnapshot).visibility ?? remoteSnapshot.visibility,
          theme: (baselineFields as SyncSnapshot).theme ?? remoteSnapshot.theme,
          members: (baselineFields as SyncSnapshot).members ?? [],
        };

    // Step 6: Resolve scalar fields scoped by changed_fields hint
    // We still evaluate all changed_fields defensively against the snapshot.
    // 'members' is intentionally not a scalar — M365 is authoritative for linked-group
    // membership, so push of member ops to Graph is deferred (spec §11). Subscribers
    // still enqueue this job for member events to keep the link snapshot fresh.
    type ScalarKey = 'name' | 'description' | 'visibility' | 'theme';
    const scalarFields: ScalarKey[] = ['name', 'description', 'visibility', 'theme'];
    const fieldsToConsider = scalarFields.filter((f) => changed_fields.includes(f));

    const graphPatchPayload: Record<string, unknown> = {};
    const localUpdatePatch: UpdateGroupPatch = {};
    const conflictFields: string[] = [];

    for (const field of fieldsToConsider) {
      const decision = resolveField({
        local: localGroup[field] as string | null,
        remote: remoteSnapshot[field] as string | null,
        snapshot: snapshot[field] as string | null,
      });

      if (decision.kind === 'local-wins') {
        // Local changed; remote still matches snapshot — push local value to Graph
        const graphProps = FIELD_TO_GRAPH[field]?.(decision.value as string | null);
        if (graphProps) Object.assign(graphPatchPayload, graphProps);
      } else if (decision.kind === 'remote-wins') {
        // Remote changed; local still matches snapshot — apply remote value locally
        // cast: field is a runtime-validated UpdateField; the discriminated UpdateGroupPatch
        //       type can't be indexed by a `string` without narrowing
        (localUpdatePatch as Record<string, unknown>)[field] = decision.value;
      } else if (decision.kind === 'conflict') {
        conflictFields.push(field);
      }
    }

    // Step 7: Push outbound PATCH if any local-wins fields
    if (Object.keys(graphPatchPayload).length > 0) {
      await graphClient.api(`/groups/${external_id}`).patch(graphPatchPayload);
    }

    // Apply remote-wins changes to local group
    if (Object.keys(localUpdatePatch).length > 0) {
      try {
        await updateGroup({
          group_id,
          expected_version: localGroup.version,
          patch: localUpdatePatch,
          session,
        });
      } catch (updateErr) {
        // Concurrent local update — treat patched fields as conflict rather than crashing
        const code = (updateErr as { code?: string }).code;
        if (code === 'CONFLICT') {
          for (const f of Object.keys(localUpdatePatch)) {
            if (!conflictFields.includes(f)) conflictFields.push(f);
          }
        } else {
          throw updateErr;
        }
      }
    }

    // Step 9: Persist updated link state — refresh snapshot to post-PATCH remote state
    await repo.upsert({
      tenantId: tenant_id,
      groupId: group_id,
      externalId: external_id,
      lastSyncedFields: remoteSnapshot,
    });
    const newStatus = conflictFields.length > 0 ? 'conflict' : 'idle';
    await repo.setSyncStatus(link.id, newStatus);

    // Step 10: Stamp external_synced_at
    await markGroupSyncStatus({
      group_id,
      external_synced_at: new Date().toISOString(),
      session,
    });

    // Step 11: Emit conflict event if any fields diverged
    if (conflictFields.length > 0) {
      await withEmit({ actor: { userId: SYSTEM_USER_ID, tenantId: tenant_id } }, async () => {
        await emit({
          tenantId: tenant_id,
          aggregateType: 'integrations.m365.group',
          aggregateId: group_id,
          eventType: 'integrations.m365.group.field-conflict',
          eventVersion: 1,
          payload: { group_id, conflict_fields: conflictFields },
        });
      });
    }
  } catch (err) {
    await repo.setSyncStatus(link.id, 'error', (err as Error).message.slice(0, 500));
    throw err;
  }
}
