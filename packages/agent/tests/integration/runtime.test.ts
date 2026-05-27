import { describe, expect, it } from 'vitest';
import { buildMastra } from '../../src/backend/runtime.ts';
import { withAgentTestDb } from '../helpers.ts';

describe('buildMastra', () => {
  it('initializes Mastra with agent-scoped storage', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      expect(mastra).toBeDefined();

      const storage = mastra.getStorage();
      expect(storage).toBeDefined();
      await (storage as { init: () => Promise<void> }).init();

      const inAgent = await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'agent' AND table_name LIKE 'mastra_%' ORDER BY table_name",
      );
      expect(inAgent.rows.length).toBeGreaterThan(0);

      const inPublic = await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'mastra_%'",
      );
      expect(inPublic.rows).toHaveLength(0);
    });
  });
});
