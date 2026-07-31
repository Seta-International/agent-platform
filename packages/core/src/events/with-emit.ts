import { type NodeTx, setTenantGuc } from '@seta/shared-db';
import type { ActorContext } from '@seta/shared-types';
import { coreDb } from '../db/client.ts';
import { emitContext } from './context.ts';

/** A nested withEmit() tried to join an open transaction under a different tenant.
 *  Re-running setTenantGuc would swap app.tenant_id mid-transaction and defeat RLS
 *  on every table the transaction touches, so the join is refused instead. */
export class CrossTenantEmitContext extends Error {
  constructor(
    readonly outerTenantId: string,
    readonly innerTenantId: string,
  ) {
    super(
      `withEmit(): cannot join an emit context opened for tenant ${outerTenantId} ` +
        `with an actor from tenant ${innerTenantId}.`,
    );
    this.name = 'CrossTenantEmitContext';
  }
}

export async function withEmit<T>(
  opts: { actor?: ActorContext } | undefined,
  body: (tx: NodeTx) => Promise<T>,
): Promise<T> {
  const outer = emitContext.getStore();
  if (outer) {
    // Join: same transaction, same store, OUTER actor kept. Deliberately no
    // setTenantGuc — the GUC is already bound to the outer tenant, and the guard
    // below guarantees the inner actor agrees with it.
    const innerTenantId = opts?.actor?.tenantId;
    const outerTenantId = outer.actor?.tenantId;
    if (innerTenantId && outerTenantId && innerTenantId !== outerTenantId) {
      throw new CrossTenantEmitContext(outerTenantId, innerTenantId);
    }
    return body(outer.tx);
  }

  return coreDb().transaction(async (tx) =>
    emitContext.run({ tx: tx as unknown as NodeTx, actor: opts?.actor }, async () => {
      if (opts?.actor?.tenantId) await setTenantGuc(tx as unknown as NodeTx, opts.actor.tenantId);
      return body(tx as unknown as NodeTx);
    }),
  );
}
