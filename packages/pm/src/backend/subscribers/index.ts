import type { SubscriberDef } from '@seta/shared-types';
import { workerProjectionCreated, workerProjectionUpdated } from './worker-projection.ts';

export function pmSubscribers(): SubscriberDef[] {
  return [workerProjectionCreated, workerProjectionUpdated];
}
