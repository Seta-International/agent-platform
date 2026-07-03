import { type NodeTx, setTenantGuc } from '@seta/shared-db';
import type { ActorContext } from '@seta/shared-types';
import { coreDb } from '../db/client.ts';
import { emitContext } from './context.ts';

export async function withEmit<T>(
  opts: { actor?: ActorContext } | undefined,
  body: (tx: NodeTx) => Promise<T>,
): Promise<T> {
  return coreDb().transaction(async (tx) =>
    emitContext.run({ tx: tx as unknown as NodeTx, actor: opts?.actor }, async () => {
      if (opts?.actor?.tenantId) await setTenantGuc(tx as unknown as NodeTx, opts.actor.tenantId);
      return body(tx as unknown as NodeTx);
    }),
  );
}
