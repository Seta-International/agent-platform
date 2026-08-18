import { expect, it } from 'vitest';
import { ActionPreviewStore } from '../../../fixtures/golden/action/preview-store.ts';

const card = {
  toolCallId: 'call-1',
  intent: 'Update "Deploy API"',
  primary: { label: 'Confirm', argsPatch: { action: 'update', taskIds: ['t1'] } },
  meta: { toolId: 'planner_updateTask', dedupKeys: ['task:t1'] },
} as never;

it('loads the card it was given, by approvalId', async () => {
  const store = new ActionPreviewStore();
  const approvalId = store.open(card);
  await expect(
    store.port.loadPreview({ tenantId: 'x', actorUserId: 'u', approvalId }),
  ).resolves.toMatchObject({ approvalId, toolId: 'planner_updateTask' });
});

it('returns null for an unknown or already-decided approval', async () => {
  const store = new ActionPreviewStore();
  const approvalId = store.open(card);
  await expect(
    store.port.loadPreview({ tenantId: 'x', actorUserId: 'u', approvalId: 'nope' }),
  ).resolves.toBeNull();
  store.decide(approvalId);
  await expect(
    store.port.loadPreview({ tenantId: 'x', actorUserId: 'u', approvalId }),
  ).resolves.toBeNull();
});

it('reports taken dedup keys from the open cards only', async () => {
  const store = new ActionPreviewStore();
  const approvalId = store.open(card);
  await expect(
    store.port.takenDedupKeys({
      tenantId: 'x',
      actorUserId: 'u',
      dedupKeys: ['task:t1', 'task:t2'],
    }),
  ).resolves.toEqual(['task:t1']);
  store.decide(approvalId);
  await expect(
    store.port.takenDedupKeys({ tenantId: 'x', actorUserId: 'u', dedupKeys: ['task:t1'] }),
  ).resolves.toEqual([]);
});

it('counts open previews, so a case can assert exactly one is pending', () => {
  const store = new ActionPreviewStore();
  const first = store.open(card);
  store.supersede(first, card);
  // Supersede retires the old card as the real writer does — one open, not two.
  expect(store.openCount()).toBe(1);
  store.reset();
  expect(store.openCount()).toBe(0);
});
