import type { SessionScope } from '@seta/core';
import {
  type Actor,
  addGroupMembers,
  grantProductAccess,
  listGroups,
  listOrgUnits,
} from '@seta/identity';
import { PRODUCT_IDS } from '@seta/shared-rbac';
import pino from 'pino';
import { ensurePersonaGroups, ensureScopedGroup } from '../lib/access-groups.ts';
import type { TopLevelDeliveryUnit } from './phase-org-structure.ts';

const log = pino({ name: 'cli/seed-fixture/access-groups' });

export async function seedAccessGroups(session: SessionScope): Promise<Map<string, string>> {
  const cliActor = { type: 'cli' as const, user_id: session.user_id };
  const groups = await ensurePersonaGroups(session, cliActor);

  for (const product_id of PRODUCT_IDS) {
    await grantProductAccess(
      {
        tenant_id: session.tenant_id,
        subject_type: 'tenant',
        subject_id: session.tenant_id,
        product_id,
        effect: 'grant',
        granted_via: 'seed',
      },
      cliActor,
    );
  }

  return groups;
}

function slugifyUnitName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * setGroupRoles validates an org_unit scope_id against identity.org_unit_projection, which only
 * catches up once the (async, event-driven) org-unit-projection subscriber processes the
 * people.org_unit.created events seedOrgStructure just emitted. apps/cli is CI-forbidden from
 * running its own dispatcher (`apps-cli-no-dispatcher`), so on a genuinely fresh clone — where
 * `pnpm db:seed` runs before `pnpm dev` ever starts one — this never catches up. Poll briefly for
 * the case a dispatcher *is* already running (tests, or a reseed after `pnpm dev` started), and
 * report false rather than hang/throw otherwise so the seed as a whole still completes.
 */
async function waitForOrgUnitsProjected(
  tenantId: string,
  unitIds: string[],
  timeoutMs = 3_000,
): Promise<boolean> {
  const want = new Set(unitIds);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const seen = new Set((await listOrgUnits(tenantId)).map((u) => u.org_unit_id));
    if ([...want].every((id) => seen.has(id))) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Demo hook for org scoping: one group per top-level delivery unit, slug `delivery-lead-<unit>`,
 * carrying org_unit-scoped `pm.manager` + `people.viewer`, with the unit's head added as a member.
 * Must run after seedOrgStructure (needs unit ids + heads) and seedPeopleIdentity (needs the
 * head worker's user id). No-op (with a warning) if identity's org-unit projection hasn't caught
 * up yet — see waitForOrgUnitsProjected. Idempotent + safe to rerun once it has (e.g. after
 * `pnpm dev` starts a dispatcher).
 */
export async function seedDeliveryLeadGroups(
  session: SessionScope,
  units: TopLevelDeliveryUnit[],
  people: Map<string, { workerId: string; userId: string }>,
): Promise<void> {
  if (units.length === 0) return;
  const actor: Actor = { type: 'cli', user_id: session.user_id };
  const workerIdToUserId = new Map(
    [...people.values()].map((p) => [p.workerId, p.userId] as const),
  );
  const projected = await waitForOrgUnitsProjected(
    session.tenant_id,
    units.map((u) => u.id),
  );
  if (!projected) {
    log.warn(
      { units: units.map((u) => u.id) },
      'identity.org_unit_projection has not caught up (no dispatcher running) — skipping ' +
        'delivery-lead groups this run; rerun `pnpm db:seed` after `pnpm dev` is up to backfill them',
    );
    return;
  }
  const existing = await listGroups(session);
  const bySlug = new Map(existing.map((g) => [g.slug, g.group_id] as const));

  for (const unit of units) {
    const slug = `delivery-lead-${slugifyUnitName(unit.name)}`;
    const groupId = await ensureScopedGroup(
      session,
      actor,
      {
        slug,
        name: `Delivery Lead — ${unit.name}`,
        roles: [
          { slug: 'pm.manager', scope_kind: 'org_unit', scope_id: unit.id },
          { slug: 'people.viewer', scope_kind: 'org_unit', scope_id: unit.id },
        ],
      },
      bySlug,
    );
    bySlug.set(slug, groupId);

    const headUserId = unit.head_worker_id ? workerIdToUserId.get(unit.head_worker_id) : undefined;
    if (headUserId) {
      await addGroupMembers(
        { group_id: groupId, tenant_id: session.tenant_id, user_ids: [headUserId] },
        actor,
      );
    }
  }
}
