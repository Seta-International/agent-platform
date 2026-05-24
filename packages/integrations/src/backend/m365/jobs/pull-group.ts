import { emit, withEmit } from '@seta/core/events';
import {
  addGroupMember,
  getGroup,
  listGroupMembers,
  markGroupSyncStatus,
  removeGroupMember,
  setMemberRole,
  type UpdateGroupPatch,
  updateGroup,
} from '@seta/planner';
import { type MemberRef, resolveField, resolveMembers } from '../lww.ts';
import type { M365GroupLinkRepo } from '../repo.ts';
import { type SyncSnapshot, snapshotFromGraph } from '../snapshot.ts';
import { buildSystemSession } from '../system-session.ts';
import type { GraphLikeRead } from './_graph-types.ts';

export type GraphLike = GraphLikeRead;

export interface RunPullGroupDeps {
  graphClient: GraphLike;
  repo: M365GroupLinkRepo;
  findUserByEntraOid: (input: {
    entra_oid: string;
    tenant_id: string;
  }) => Promise<{ user_id: string } | null>;
  findEntraOidByUserId: (input: { user_id: string; tenant_id: string }) => Promise<string | null>;
}

export interface RunPullGroupInput {
  tenant_id: string;
  group_id: string;
  external_id: string;
  /** When true, skip the existing delta_link and do a full re-pull. */
  full?: boolean;
}

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

interface GraphMember {
  id: string;
  displayName?: string;
  mail?: string;
}

interface GraphGroupResponse {
  id?: string;
  displayName?: string;
  description?: string;
  visibility?: string;
  theme?: string;
  mailNickname?: string;
}

interface GraphMembersResponse {
  value: GraphMember[];
}

interface GraphDeltaResponse {
  value: unknown[];
  '@odata.deltaLink'?: string;
}

function extractDeltaToken(deltaResponse: GraphDeltaResponse): string | null {
  return deltaResponse['@odata.deltaLink'] ?? null;
}

function is410(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  return e.statusCode === 410 || e.status === 410;
}

export async function runPullGroup(
  input: RunPullGroupInput,
  deps: RunPullGroupDeps,
): Promise<void> {
  const { tenant_id, group_id, external_id } = input;
  const { graphClient, repo, findUserByEntraOid, findEntraOidByUserId } = deps;

  const session = buildSystemSession(tenant_id);

  const link = await repo.findByGroup(group_id);
  if (!link) {
    throw new Error(`No m365_group_links row found for group_id=${group_id}`);
  }

  await repo.setSyncStatus(link.id, 'pulling');

  try {
    // Step 3: Fetch remote group
    const remoteGroup = (await graphClient
      .api(`/groups/${external_id}`)
      .select('displayName', 'description', 'visibility', 'theme', 'mailNickname')
      .get()) as GraphGroupResponse;

    // Step 4: Fetch members and owners
    const membersResp = (await graphClient
      .api(`/groups/${external_id}/members`)
      .get()) as GraphMembersResponse;
    const ownersResp = (await graphClient
      .api(`/groups/${external_id}/owners`)
      .get()) as GraphMembersResponse;

    const ownerOids = new Set((ownersResp.value ?? []).map((o) => o.id));

    const remoteMemberRefs: MemberRef[] = (membersResp.value ?? []).map((m) => ({
      entra_oid: m.id,
      role: ownerOids.has(m.id) ? 'owner' : 'member',
    }));

    // Step 5: Build remote snapshot
    const remoteSnapshot = snapshotFromGraph(
      {
        displayName: remoteGroup.displayName,
        description: remoteGroup.description,
        visibility: remoteGroup.visibility,
        theme: remoteGroup.theme,
      },
      remoteMemberRefs,
    );

    // Step 6: Load local group
    const localGroup = await getGroup({ group_id, session });

    // Step 7: Load local members and build MemberRef[] with entra_oid
    const localMemberRows = await listGroupMembers({ group_id, session });
    const localMemberRefs: MemberRef[] = [];
    for (const m of localMemberRows) {
      const oid = await findEntraOidByUserId({ user_id: m.user_id, tenant_id });
      if (oid) {
        localMemberRefs.push({ entra_oid: oid, role: m.role });
      }
      // Members without an entra_oid are out of scope for LWW comparison (Note B from spec)
    }

    // Step 8: Baseline snapshot
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

    // Step 9: Resolve scalar fields
    const patch: UpdateGroupPatch = {};
    const conflictFields: string[] = [];

    type ScalarKey = 'name' | 'description' | 'visibility' | 'theme';
    const scalarFields: ScalarKey[] = ['name', 'description', 'visibility', 'theme'];
    for (const field of scalarFields) {
      const decision = resolveField({
        local: localGroup[field] as string | null,
        remote: remoteSnapshot[field] as string | null,
        snapshot: snapshot[field] as string | null,
      });
      if (decision.kind === 'remote-wins') {
        // Each field maps directly onto UpdateGroupPatch — the cast is safe because
        // snapshotFromGraph already normalises theme/visibility to their valid enum values.
        (patch as Record<string, unknown>)[field] = decision.value;
      } else if (decision.kind === 'conflict') {
        conflictFields.push(field);
      }
    }

    // Step 10: Apply patch if non-empty
    if (Object.keys(patch).length > 0) {
      try {
        await updateGroup({
          group_id,
          expected_version: localGroup.version,
          patch,
          session,
        });
      } catch (updateErr) {
        // Version conflict means someone else updated concurrently — treat as conflict
        const code = (updateErr as { code?: string }).code;
        if (code === 'CONFLICT') {
          for (const f of Object.keys(patch)) {
            if (!conflictFields.includes(f)) conflictFields.push(f);
          }
        } else {
          throw updateErr;
        }
      }
    }

    // Step 11: Resolve members
    const memberResolution = resolveMembers({
      remote: remoteMemberRefs,
      local: localMemberRefs,
      snapshot: isFirstRun ? [] : (snapshot.members ?? []),
    });

    // Process adds
    for (const add of memberResolution.adds) {
      const found = await findUserByEntraOid({ entra_oid: add.entra_oid, tenant_id });
      if (!found) {
        // Emit skipped event — needs its own withEmit context
        await withEmit({ actor: { userId: SYSTEM_USER_ID, tenantId: tenant_id } }, async () => {
          await emit({
            tenantId: tenant_id,
            aggregateType: 'integrations.m365.group',
            aggregateId: group_id,
            eventType: 'integrations.m365.member.skipped',
            eventVersion: 1,
            payload: {
              group_id,
              entra_oid: add.entra_oid,
              reason: 'not_provisioned' as const,
            },
          });
        });
        continue;
      }
      await addGroupMember({ group_id, user_id: found.user_id, session });
      if (add.role === 'owner') {
        await setMemberRole({ group_id, user_id: found.user_id, role: 'owner', session });
      }
    }

    // Process removes
    for (const rem of memberResolution.removes) {
      const found = await findUserByEntraOid({ entra_oid: rem.entra_oid, tenant_id });
      if (found) {
        await removeGroupMember({ group_id, user_id: found.user_id, session });
      }
    }

    // Process role changes
    for (const rc of memberResolution.roleChanges) {
      const found = await findUserByEntraOid({ entra_oid: rc.entra_oid, tenant_id });
      if (found) {
        await setMemberRole({ group_id, user_id: found.user_id, role: rc.after_role, session });
      }
    }

    // Step 12: Member conflicts
    if (memberResolution.conflicts.length > 0) {
      conflictFields.push('members');
    }

    // Step 13: Fetch new deltaLink
    let deltaLink: string | null = null;
    try {
      const deltaResp = (await graphClient
        .api(`/groups/delta`)
        .filter(`id eq '${external_id}'`)
        .get()) as GraphDeltaResponse;
      deltaLink = extractDeltaToken(deltaResp);
    } catch (deltaErr) {
      if (is410(deltaErr) && !input.full) {
        // Clear stale delta link and do a full re-pull
        await repo.setSyncStatus(link.id, 'idle');
        return runPullGroup({ ...input, full: true }, deps);
      }
      throw deltaErr;
    }

    // Step 14: Persist link row — upsert stores new snapshot + deltaLink, then set final status
    await repo.upsert({
      tenantId: tenant_id,
      groupId: group_id,
      externalId: external_id,
      lastSyncedFields: remoteSnapshot,
      deltaLink,
    });
    const newStatus = conflictFields.length > 0 ? 'conflict' : 'idle';
    // upsert does not update syncStatus; set it explicitly regardless of outcome
    await repo.setSyncStatus(link.id, newStatus);

    // Step 15: Mark external_synced_at on the group
    await markGroupSyncStatus({
      group_id,
      external_synced_at: new Date().toISOString(),
      session,
    });

    // Step 16: Emit conflict event if fields diverged
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
