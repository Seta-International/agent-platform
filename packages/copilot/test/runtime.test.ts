import { describe, expect, it } from 'vitest';
import { buildMastra } from '../src/backend/runtime.ts';
import { withCopilotTestDb } from './test-helpers.ts';

describe('buildMastra', () => {
  it('initializes Mastra with copilot-scoped storage', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      expect(mastra).toBeDefined();

      const storage = mastra.getStorage();
      expect(storage).toBeDefined();
      await (storage as { init: () => Promise<void> }).init();

      const inCopilot = await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'copilot' AND table_name LIKE 'mastra_%' ORDER BY table_name",
      );
      expect(inCopilot.rows.length).toBeGreaterThan(0);

      const inPublic = await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'mastra_%'",
      );
      expect(inPublic.rows).toHaveLength(0);
    });
  });
});
