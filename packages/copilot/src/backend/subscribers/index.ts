import type { SubscriberDef } from '@seta/shared-types';
import { supersedeStaleAssignApprovalsSubscriber } from './supersede-stale-assign-approvals.ts';

export function copilotSubscribers(): SubscriberDef[] {
  return [supersedeStaleAssignApprovalsSubscriber() as SubscriberDef];
}
