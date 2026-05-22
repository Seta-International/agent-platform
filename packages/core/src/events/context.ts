import { AsyncLocalStorage } from 'node:async_hooks';
import type { NodeTx } from '@seta/shared-db';
import type { ActorContext } from '@seta/shared-types';

export interface EmitCtx {
  tx: NodeTx;
  causedByEventId?: string;
  traceId?: string;
  actor?: ActorContext;
}

export const emitContext = new AsyncLocalStorage<EmitCtx>();
