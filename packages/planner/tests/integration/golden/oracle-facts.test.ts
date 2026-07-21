import { expect, it } from 'vitest';
import { USER_TUAN_ID } from '../../fixtures/golden/constants.ts';
import { generateGoldenFacts } from '../../fixtures/golden/oracles/generate-facts.ts';
import { cleanGoldenDataset, seedGoldenDataset } from '../../fixtures/golden/seed.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

it('oracle reports Tuan open-task count from raw SQL', async () => {
  await withAgentTestDb(async ({ pool }) => {
    await cleanGoldenDataset(pool);
    await seedGoldenDataset(pool);
    const facts = await generateGoldenFacts(pool);
    expect(facts.facts.users[USER_TUAN_ID]?.openTaskCount).toBe(12);
    await cleanGoldenDataset(pool);
  });
});
