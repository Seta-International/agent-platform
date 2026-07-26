import { expect, it } from 'vitest';
import { withGoldenLock } from '../../fixtures/golden/oracles/with-golden-lock.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it('serializes concurrent golden pipeline runs', async () => {
  await withAgentTestDb(async ({ pool }) => {
    const order: string[] = [];
    await Promise.all([
      withGoldenLock(pool, async () => {
        order.push('A-start');
        await sleep(50);
        order.push('A-end');
      }),
      withGoldenLock(pool, async () => {
        order.push('B-start');
        await sleep(10);
        order.push('B-end');
      }),
    ]);
    expect(order.join(',')).toMatch(/A-start,A-end,B-start,B-end|B-start,B-end,A-start,A-end/);
  });
});
