import {
  createOrgUnit,
  deleteOrgUnit,
  getOrgStructure,
  listWorkers,
  syncDirectoryPeople,
  updateOrgUnit,
} from '@seta/people';
import type { PeopleDirectorySurface } from './sync.ts';

/**
 * Adapts the real `@seta/people` module onto `PeopleDirectorySurface`.
 *
 * The module is NOT structurally assignable to it, and both gaps are silent data bugs rather than
 * type-level pedantry:
 * - `createOrgUnit` returns `{ org_unit_id }`, the surface wants `{ id }` — unadapted, every unit
 *   the sync creates gets `undefined` for its id and the `m365_org_unit_links` write fails.
 * - `getOrgStructure` returns a resolved `head: { person_id, full_name } | null`, the surface
 *   wants the raw `head_worker_id` — unadapted, `resolveHeads` sees every head as `undefined`,
 *   never equal to its chosen candidate, and rewrites every unit head on every run. Its `members`
 *   are records; the surface wants ids, which is all `unit_delete_blocked`'s counts need.
 * - `listWorkers` answers paginated rows; the surface wants a `person_id -> full_name` lookup.
 *   The `ids` path is unpaginated, but ONLY when the array is non-empty — an empty `ids` falls
 *   through to the default page and would hand back 20 arbitrary workers, so it short-circuits.
 *
 * The return-type annotation below is what proves the shape against the real exports at
 * `typecheck` time. It is the only check there is: `integrations` tests cannot execute this file,
 * because the `people` schema is not migrated into this package's testcontainer.
 *
 * RBAC is re-checked inside every one of these functions; hand it `buildSystemSession(tenantId)`,
 * whose `system.integrations.m365` role carries `people.worker.read`, `people.worker.create`,
 * `people.worker.update` and `people.org_unit.manage`.
 */
export function createPeopleDirectorySurface(): PeopleDirectorySurface {
  return {
    getOrgStructure: async (session) => {
      const { units } = await getOrgStructure(session);
      return {
        units: units.map((u) => ({
          id: u.id,
          parent_id: u.parent_id,
          name: u.name,
          kind: u.kind,
          head_worker_id: u.head?.person_id ?? null,
          member_ids: u.members.map((m) => m.person_id),
        })),
      };
    },
    listWorkerNames: async ({ person_ids, session }) => {
      if (person_ids.length === 0) return new Map<string, string>();
      const { rows } = await listWorkers(session, { ids: [...person_ids] });
      return new Map(rows.map((r) => [r.worker_id, r.full_name]));
    },
    createOrgUnit: async (input) => {
      const { org_unit_id } = await createOrgUnit(input);
      return { id: org_unit_id };
    },
    updateOrgUnit: (input) => updateOrgUnit(input),
    deleteOrgUnit: (input) => deleteOrgUnit(input),
    syncDirectoryPeople: (input) => syncDirectoryPeople(input),
  };
}
