import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { copilotDb } from '../../../src/backend/db/index.ts';
import { tenantSettings } from '../../../src/backend/db/schema.tenant-settings.ts';
import { withCopilotTestDb } from '../../helpers.ts';

describe('copilot.tenant_settings', () => {
  it('round-trips JSONB columns', async () => {
    await withCopilotTestDb(async () => {
      const tenantId = crypto.randomUUID();
      await copilotDb()
        .insert(tenantSettings)
        .values({
          tenantId,
          dedupWeights: { semantic: 0.55, vector: 0.3, position: 0.15 },
          dedupThresholds: { likelyDup: 0.18, maybeDup: 0.3 },
          assignmentWeights: { exact: 0.4, vec: 0.25, load: 0.25, tz: 0.1 },
          approvalTtlHours: 72,
        });
      const [row] = await copilotDb()
        .select()
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId));
      expect(row!.dedupThresholds).toEqual({ likelyDup: 0.18, maybeDup: 0.3 });
      expect(row!.dedupWeights).toEqual({ semantic: 0.55, vector: 0.3, position: 0.15 });
      expect(row!.approvalTtlHours).toBe(72);
    });
  });
});
