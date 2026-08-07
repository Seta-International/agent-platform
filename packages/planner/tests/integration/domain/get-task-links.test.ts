import { describe, expect, it } from 'vitest';
import { linkTasks } from '../../../src/backend/domain/link-tasks.ts';
import { createGroup, createPlan, createTask, deleteTask, getTask } from '../../../src/index.ts';
import { buildSession, makeMemberSession, seedTenant } from '../../helpers.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

describe('getTask — links', () => {
  it('returns both directions, resolved to the OTHER task', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      const session = seeded.adminSession;
      const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
      const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
      const a = await createTask({ plan_id: plan.id, title: 'Alpha', session });
      const b = await createTask({ plan_id: plan.id, title: 'Beta', session });
      const c = await createTask({ plan_id: plan.id, title: 'Gamma', session });
      await linkTasks({ source_task_id: a.id, target_task_id: b.id, kind: 'relates', session });
      await linkTasks({ source_task_id: c.id, target_task_id: a.id, kind: 'blocks', session });

      const detail = await getTask({ task_id: a.id, session });
      expect(detail.links).toHaveLength(2);
      expect(detail.links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            direction: 'outgoing',
            kind: 'relates',
            other_task_id: b.id,
            other_task_title: 'Beta',
            other_task_deleted_at: null,
          }),
          expect.objectContaining({
            direction: 'incoming',
            kind: 'blocks',
            other_task_id: c.id,
            other_task_title: 'Gamma',
          }),
        ]),
      );
    }));

  // Merge soft-deletes the duplicate, so filtering trashed endpoints out would
  // make a merge's own result invisible the moment it lands.
  it('lists a TRASHED endpoint with deleted_at set, rather than filtering it out', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      const session = seeded.adminSession;
      const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
      const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });
      const keep = await createTask({ plan_id: plan.id, title: 'Keep', session });
      const dup = await createTask({ plan_id: plan.id, title: 'Dup', session });
      await linkTasks({
        source_task_id: dup.id,
        target_task_id: keep.id,
        kind: 'duplicates',
        session,
      });
      await deleteTask({ task_id: dup.id, expected_version: dup.version, session });

      const detail = await getTask({ task_id: keep.id, session });
      expect(detail.links).toHaveLength(1);
      expect(detail.links[0]).toMatchObject({
        direction: 'incoming',
        kind: 'duplicates',
        other_task_id: dup.id,
      });
      expect(detail.links[0]!.other_task_deleted_at).not.toBeNull();
    }));

  it('omits a link whose other endpoint is in a group the actor cannot reach', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      const admin = seeded.adminSession;
      const groupA = await createGroup({ tenant_id: seeded.tenant_id, name: 'A', session: admin });
      const groupB = await createGroup({ tenant_id: seeded.tenant_id, name: 'B', session: admin });
      const planA = await createPlan({ group_id: groupA.id, name: 'PA', session: admin });
      const planB = await createPlan({ group_id: groupB.id, name: 'PB', session: admin });
      const a = await createTask({ plan_id: planA.id, title: 'Alpha', session: admin });
      const b = await createTask({ plan_id: planB.id, title: 'Secret', session: admin });
      await linkTasks({
        source_task_id: a.id,
        target_task_id: b.id,
        kind: 'relates',
        session: admin,
      });

      const member = await makeMemberSession(pool, {
        tenant_id: seeded.tenant_id,
        group_id: groupA.id,
        role: 'member',
      });

      // linkTasks required update on both groups AT CREATION TIME; permissions
      // change, and without this filter the title "Secret" leaks on every read.
      const detail = await getTask({ task_id: a.id, session: member });
      expect(detail.links).toHaveLength(0);
    }));

  // `cross_tenant_read` makes groupFilterFor return null, which switches OFF the
  // visibility filter — so this persona SEES the group-B link. can_unlink must
  // still be false for it, because the write gate uses isTenantWide + membership,
  // and cross_tenant_read satisfies neither. Reusing `groupFilter === null` as
  // "tenant-wide" would light up a Remove button that 403s.
  it('can_unlink follows membership, not the null read-filter, for cross_tenant_read', () =>
    withAgentTestDb(async ({ pool }) => {
      const seeded = await seedTenant(pool);
      const admin = seeded.adminSession;
      const groupA = await createGroup({ tenant_id: seeded.tenant_id, name: 'A', session: admin });
      const groupB = await createGroup({ tenant_id: seeded.tenant_id, name: 'B', session: admin });
      const planA = await createPlan({ group_id: groupA.id, name: 'PA', session: admin });
      const planB = await createPlan({ group_id: groupB.id, name: 'PB', session: admin });
      const a = await createTask({ plan_id: planA.id, title: 'Alpha', session: admin });
      const sibling = await createTask({ plan_id: planA.id, title: 'Sibling', session: admin });
      const far = await createTask({ plan_id: planB.id, title: 'Far', session: admin });
      await linkTasks({
        source_task_id: a.id,
        target_task_id: sibling.id,
        kind: 'relates',
        session: admin,
      });
      await linkTasks({
        source_task_id: a.id,
        target_task_id: far.id,
        kind: 'blocks',
        session: admin,
      });

      // org.admin is tenant-wide, so it CAN unlink both.
      const asAdmin = await getTask({ task_id: a.id, session: admin });
      expect(asAdmin.links.map((l) => l.can_unlink)).toEqual([true, true]);

      // A member of group A only, carrying planner.task.update, plus
      // cross_tenant_read so the visibility filter is off.
      const member = await makeMemberSession(pool, {
        tenant_id: seeded.tenant_id,
        group_id: groupA.id,
        role: 'member',
      });
      const reader = buildSession({
        tenant_id: seeded.tenant_id,
        user_id: member.user_id,
        roles: ['planner.member'],
        cross_tenant_read: true,
      });

      const asReader = await getTask({ task_id: a.id, session: reader });
      // Both links are VISIBLE (filter off), but only the in-group one is unlinkable.
      expect(asReader.links).toHaveLength(2);
      const byOther = new Map(asReader.links.map((l) => [l.other_task_id, l.can_unlink]));
      expect(byOther.get(sibling.id)).toBe(true);
      expect(byOther.get(far.id)).toBe(false);
    }));
});
