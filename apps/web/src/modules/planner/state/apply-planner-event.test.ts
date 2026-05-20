import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPlannerEvent, type StreamEvent } from './apply-planner-event';
import { plannerKeys } from './query-keys';
import { __resetRingForTests, rememberEventId } from './recent-mutation-event-ids';

function makeEvent(over: Partial<StreamEvent> = {}): StreamEvent {
  return {
    id: 'e-1',
    eventType: 'planner.group.created',
    eventVersion: 1,
    aggregateType: 'planner.group',
    aggregateId: 'g1',
    tenantId: 't1',
    occurredAt: new Date().toISOString(),
    payload: { actor: { type: 'user', user_id: 'u' }, group_id: 'g1' },
    ...over,
  };
}

describe('applyPlannerEvent', () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient();
    __resetRingForTests();
  });

  it('planner.group.created invalidates plannerKeys.groups()', () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    applyPlannerEvent(qc, makeEvent());
    expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.groups() });
  });

  it("planner.group.member.added invalidates the group's members cache", () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    applyPlannerEvent(qc, makeEvent({ eventType: 'planner.group.member.added' }));
    expect(spy).toHaveBeenCalledWith({ queryKey: plannerKeys.groupMembers('g1') });
  });

  it('skips its own echo when isOwnEcho returns true', () => {
    rememberEventId('echo-1');
    const spy = vi.spyOn(qc, 'invalidateQueries');
    applyPlannerEvent(qc, makeEvent({ id: 'echo-1' }));
    expect(spy).not.toHaveBeenCalled();
  });
});
