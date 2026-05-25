import { describe, expect, it } from 'vitest';
import { copilotDb } from '../../../src/backend/db/index.ts';
import { tenantSettings } from '../../../src/backend/db/schema.tenant-settings.ts';
import {
  DEFAULT_TENANT_SETTINGS,
  getTenantSettings,
} from '../../../src/backend/tenant-settings.ts';
import { withCopilotTestDb } from '../../helpers.ts';

describe('getTenantSettings', () => {
  it('returns DEFAULT when tenant has no row', async () => {
    await withCopilotTestDb(async () => {
      const got = await getTenantSettings(crypto.randomUUID());
      expect(got).toEqual(DEFAULT_TENANT_SETTINGS);
    });
  });

  it('merges stored row over defaults', async () => {
    await withCopilotTestDb(async () => {
      const tenantId = crypto.randomUUID();
      await copilotDb()
        .insert(tenantSettings)
        .values({
          tenantId,
          dedupWeights: DEFAULT_TENANT_SETTINGS.dedupWeights,
          dedupThresholds: { likelyDup: 0.1, maybeDup: 0.4 },
          assignmentWeights: DEFAULT_TENANT_SETTINGS.assignmentWeights,
          approvalTtlHours: 72,
        });
      const got = await getTenantSettings(tenantId);
      expect(got.dedupThresholds.likelyDup).toBe(0.1);
      expect(got.dedupThresholds.maybeDup).toBe(0.4);
      expect(got.dedupWeights).toEqual(DEFAULT_TENANT_SETTINGS.dedupWeights);
      expect(got.assignmentWeights).toEqual(DEFAULT_TENANT_SETTINGS.assignmentWeights);
      expect(got.approvalTtlHours).toBe(72);
    });
  });
});
