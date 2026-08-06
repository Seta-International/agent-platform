import { describe, expect, it } from 'vitest';
import { createDirectoryRepo } from '../../src/backend/m365/directory/repo.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '99999999-9999-9999-9999-999999999999';
const PERSON_1 = '22222222-2222-2222-2222-222222222222';
const PERSON_2 = '33333333-3333-3333-3333-333333333333';
const ORG_UNIT_1 = '44444444-4444-4444-4444-444444444444';
const ENTRA_OID_1 = '55555555-5555-5555-5555-555555555555';
const ENTRA_OID_2 = '66666666-6666-6666-6666-666666666666';

describe('createDirectoryRepo', () => {
  describe('person links', () => {
    it('upsertPersonLink twice with the same natural key results in exactly one row', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });

        await repo.upsertPersonLink({
          tenantId: TENANT_A,
          personId: PERSON_1,
          entraOid: ENTRA_OID_1,
          department: 'Engineering',
        });
        await repo.upsertPersonLink({
          tenantId: TENANT_A,
          personId: PERSON_1,
          entraOid: ENTRA_OID_1,
          department: 'Product',
        });

        const rows = await repo.listPersonLinks(TENANT_A);
        expect(rows.length).toBe(1);
        expect(rows[0]?.department).toBe('Product');
      });
    });

    it('findPersonLinkByOid returns the linked row', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });

        await repo.upsertPersonLink({
          tenantId: TENANT_A,
          personId: PERSON_1,
          entraOid: ENTRA_OID_1,
        });

        const found = await repo.findPersonLinkByOid(TENANT_A, ENTRA_OID_1);
        expect(found?.personId).toBe(PERSON_1);
        expect(await repo.findPersonLinkByOid(TENANT_A, ENTRA_OID_2)).toBeNull();
      });
    });

    it('markRemoved stamps removedAt without deleting the row', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });

        await repo.upsertPersonLink({
          tenantId: TENANT_A,
          personId: PERSON_1,
          entraOid: ENTRA_OID_1,
        });
        await repo.markRemoved(TENANT_A, ENTRA_OID_1);

        const found = await repo.findPersonLinkByOid(TENANT_A, ENTRA_OID_1);
        expect(found?.removedAt).not.toBeNull();
      });
    });
  });

  describe('org unit links', () => {
    it('upsertOrgUnitLink twice with the same natural key results in exactly one row', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });

        await repo.upsertOrgUnitLink({
          tenantId: TENANT_A,
          orgUnitId: ORG_UNIT_1,
          entraKey: 'entra-dept-1',
          kind: 'department',
        });
        await repo.upsertOrgUnitLink({
          tenantId: TENANT_A,
          orgUnitId: ORG_UNIT_1,
          entraKey: 'entra-dept-1',
          kind: 'division',
        });

        const rows = await repo.listOrgUnitLinks(TENANT_A);
        expect(rows.length).toBe(1);
        expect(rows[0]?.kind).toBe('division');
      });
    });

    it('deleteOrgUnitLink removes the row', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });

        await repo.upsertOrgUnitLink({
          tenantId: TENANT_A,
          orgUnitId: ORG_UNIT_1,
          entraKey: 'entra-dept-1',
          kind: 'department',
        });
        await repo.deleteOrgUnitLink(TENANT_A, ORG_UNIT_1);

        expect(await repo.listOrgUnitLinks(TENANT_A)).toEqual([]);
      });
    });
  });

  describe('conflicts', () => {
    it('raiseConflict twice with the same natural key results in one row with a bumped last_seen_at', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });

        await repo.raiseConflict({
          tenantId: TENANT_A,
          kind: 'email_collision',
          subjectType: 'person',
          subjectId: PERSON_1,
          entraOid: ENTRA_OID_1,
          detail: { attempt: 1 },
        });
        const [firstRow] = await repo.listConflicts(TENANT_A, 'open');
        const firstSeenAt = firstRow?.firstSeenAt;
        const firstLastSeenAt = firstRow?.lastSeenAt;

        await new Promise((resolve) => setTimeout(resolve, 2));

        await repo.raiseConflict({
          tenantId: TENANT_A,
          kind: 'email_collision',
          subjectType: 'person',
          subjectId: PERSON_1,
          entraOid: ENTRA_OID_1,
          detail: { attempt: 2 },
        });

        const rows = await repo.listConflicts(TENANT_A, 'open');
        expect(rows.length).toBe(1);
        expect(rows[0]?.detail).toEqual({ attempt: 2 });
        expect(rows[0]?.firstSeenAt.getTime()).toBe(firstSeenAt!.getTime());
        expect(rows[0]?.lastSeenAt.getTime()).toBeGreaterThan(firstLastSeenAt!.getTime());
      });
    });

    it('raiseConflict twice with a NULL subject_id dedupes to one row (unmatched Entra user)', async () => {
      // Realistic case: an Entra user with no matching person yet has no subject_id.
      // NULLs compare distinct by default in a Postgres unique index, so this is the
      // case that exposes whether the dedupe index actually constrains NULLs.
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });

        await repo.raiseConflict({
          tenantId: TENANT_A,
          kind: 'user_removed',
          subjectType: 'person',
          subjectId: null,
          entraOid: ENTRA_OID_1,
          detail: { attempt: 1 },
        });
        await repo.raiseConflict({
          tenantId: TENANT_A,
          kind: 'user_removed',
          subjectType: 'person',
          subjectId: null,
          entraOid: ENTRA_OID_1,
          detail: { attempt: 2 },
        });

        const rows = await repo.listConflicts(TENANT_A, 'open');
        expect(rows.length).toBe(1);
        expect(rows[0]?.detail).toEqual({ attempt: 2 });
      });
    });

    it('raiseConflict twice with a NULL entra_oid dedupes to one row (org-unit conflict)', async () => {
      // Org-unit conflicts (e.g. unit_delete_blocked) have no Entra object id at all.
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });

        await repo.raiseConflict({
          tenantId: TENANT_A,
          kind: 'unit_delete_blocked',
          subjectType: 'org_unit',
          subjectId: ORG_UNIT_1,
          entraOid: null,
          detail: { attempt: 1 },
        });
        await repo.raiseConflict({
          tenantId: TENANT_A,
          kind: 'unit_delete_blocked',
          subjectType: 'org_unit',
          subjectId: ORG_UNIT_1,
          entraOid: null,
          detail: { attempt: 2 },
        });

        const rows = await repo.listConflicts(TENANT_A, 'open');
        expect(rows.length).toBe(1);
        expect(rows[0]?.detail).toEqual({ attempt: 2 });
      });
    });

    it('raiseConflict after closeConflict creates a second row (partial index only constrains open)', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });

        await repo.raiseConflict({
          tenantId: TENANT_A,
          kind: 'spine_collision',
          subjectType: 'person',
          subjectId: PERSON_1,
          entraOid: ENTRA_OID_1,
          detail: { attempt: 1 },
        });
        const [opened] = await repo.listConflicts(TENANT_A, 'open');
        expect(opened).toBeDefined();

        await repo.closeConflict({
          tenantId: TENANT_A,
          id: opened!.id,
          status: 'resolved',
          resolution: { note: 'fixed manually' },
          resolvedBy: PERSON_2,
        });
        expect(await repo.listConflicts(TENANT_A, 'open')).toEqual([]);

        await repo.raiseConflict({
          tenantId: TENANT_A,
          kind: 'spine_collision',
          subjectType: 'person',
          subjectId: PERSON_1,
          entraOid: ENTRA_OID_1,
          detail: { attempt: 2 },
        });

        const openAgain = await repo.listConflicts(TENANT_A, 'open');
        expect(openAgain.length).toBe(1);
        expect(openAgain[0]?.id).not.toBe(opened!.id);
      });
    });

    it('listConflicts(tenantId, "open") excludes resolved rows', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });

        await repo.raiseConflict({
          tenantId: TENANT_A,
          kind: 'manager_ambiguous',
          subjectType: 'person',
          subjectId: PERSON_1,
          entraOid: ENTRA_OID_1,
          detail: {},
        });
        await repo.raiseConflict({
          tenantId: TENANT_A,
          kind: 'manager_ambiguous',
          subjectType: 'person',
          subjectId: PERSON_2,
          entraOid: ENTRA_OID_2,
          detail: {},
        });
        const [first, second] = await repo.listConflicts(TENANT_A, 'open');
        expect(first).toBeDefined();
        expect(second).toBeDefined();

        await repo.closeConflict({
          tenantId: TENANT_A,
          id: first!.id,
          status: 'resolved',
          resolution: null,
          resolvedBy: PERSON_2,
        });

        const openOnly = await repo.listConflicts(TENANT_A, 'open');
        expect(openOnly.length).toBe(1);
        expect(openOnly[0]?.id).toBe(second!.id);

        const resolvedOnly = await repo.listConflicts(TENANT_A, 'resolved');
        expect(resolvedOnly.length).toBe(1);
        expect(resolvedOnly[0]?.id).toBe(first!.id);
      });
    });

    it('getConflict returns a single conflict by id, scoped to tenant', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });

        await repo.raiseConflict({
          tenantId: TENANT_A,
          kind: 'manager_ambiguous',
          subjectType: 'person',
          subjectId: PERSON_1,
          entraOid: ENTRA_OID_1,
          detail: { x: 1 },
        });
        const [row] = await repo.listConflicts(TENANT_A, 'open');

        expect((await repo.getConflict(TENANT_A, row!.id))?.id).toBe(row!.id);
        expect(await repo.getConflict(TENANT_B, row!.id)).toBeNull();
        expect(await repo.getConflict(TENANT_A, ORG_UNIT_1)).toBeNull();
      });
    });
  });

  describe('tenant isolation', () => {
    it('never returns or mutates another tenant rows', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });

        await repo.upsertPersonLink({
          tenantId: TENANT_A,
          personId: PERSON_1,
          entraOid: ENTRA_OID_1,
        });
        await repo.upsertPersonLink({
          tenantId: TENANT_B,
          personId: PERSON_1,
          entraOid: ENTRA_OID_1,
        });

        expect((await repo.listPersonLinks(TENANT_A)).length).toBe(1);
        expect((await repo.listPersonLinks(TENANT_B)).length).toBe(1);

        await repo.upsertOrgUnitLink({
          tenantId: TENANT_A,
          orgUnitId: ORG_UNIT_1,
          entraKey: 'shared-key',
          kind: 'department',
        });
        await repo.upsertOrgUnitLink({
          tenantId: TENANT_B,
          orgUnitId: ORG_UNIT_1,
          entraKey: 'shared-key',
          kind: 'division',
        });
        expect((await repo.listOrgUnitLinks(TENANT_A))[0]?.kind).toBe('department');
        expect((await repo.listOrgUnitLinks(TENANT_B))[0]?.kind).toBe('division');

        await repo.raiseConflict({
          tenantId: TENANT_A,
          kind: 'manager_ambiguous',
          subjectType: 'person',
          subjectId: PERSON_1,
          entraOid: ENTRA_OID_1,
          detail: { tenant: 'A' },
        });
        await repo.raiseConflict({
          tenantId: TENANT_B,
          kind: 'manager_ambiguous',
          subjectType: 'person',
          subjectId: PERSON_1,
          entraOid: ENTRA_OID_1,
          detail: { tenant: 'B' },
        });

        const conflictsA = await repo.listConflicts(TENANT_A, 'open');
        const conflictsB = await repo.listConflicts(TENANT_B, 'open');
        expect(conflictsA.length).toBe(1);
        expect(conflictsB.length).toBe(1);
        expect(conflictsA[0]?.id).not.toBe(conflictsB[0]?.id);

        // closeConflict scoped to the wrong tenant must not mutate the other tenant's row
        await repo.closeConflict({
          tenantId: TENANT_B,
          id: conflictsA[0]!.id,
          status: 'resolved',
          resolution: null,
          resolvedBy: PERSON_2,
        });
        expect((await repo.listConflicts(TENANT_A, 'open')).length).toBe(1);
      });
    });
  });
});
