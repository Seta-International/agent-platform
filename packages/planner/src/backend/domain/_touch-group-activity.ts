import type { NodeTx } from '@seta/shared-db';
import { eq } from 'drizzle-orm';
import { groups } from '../db/schema.ts';

/** Bump the Groups list Activity column without incrementing group.version. */
export async function touchGroupActivity(tx: NodeTx, input: { group_id: string }): Promise<void> {
  await tx.update(groups).set({ updated_at: new Date() }).where(eq(groups.id, input.group_id));
}

export function extractGroupIdFromPayload(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  if (typeof p.group_id === 'string') return p.group_id;
  const after = p.after;
  if (typeof after === 'object' && after !== null) {
    const nested = (after as Record<string, unknown>).group_id;
    if (typeof nested === 'string') return nested;
  }
  return undefined;
}
