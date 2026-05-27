import type { SubscriberDef } from '@seta/shared-types';
import { supersedeStaleAssignApprovalsSubscriber } from './supersede-stale-assign-approvals.ts';

export function agentSubscribers(): SubscriberDef[] {
  return [supersedeStaleAssignApprovalsSubscriber() as SubscriberDef];
}
