import { AsyncLocalStorage } from 'node:async_hooks';
import type { NodeTx } from '@seta/shared-db';
import type { ActorContext } from '@seta/shared-types';

export interface EmitCtx {
  tx: NodeTx;
  causedByEventId?: string;
  traceId?: string;
  actor?: ActorContext;
  /** Old value of the mutated entity, written to core.events.before. */
  before?: unknown;
  /** New value of the mutated entity, written to core.events.after. */
  after?: unknown;
  /** When present, emit() appends each event id it writes. withGatedMutation() uses
   *  this to backfill `after` on rows the domain functions emitted before the
   *  post-mutation snapshot existed. */
  emittedEventIds?: string[];
}

export const emitContext = new AsyncLocalStorage<EmitCtx>();
