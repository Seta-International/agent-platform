import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type NodeTx = NodePgDatabase<Record<string, unknown>>;

export async function withTx<T>(
  db: NodePgDatabase<Record<string, unknown>>,
  fn: (tx: NodeTx) => Promise<T>,
  opts?: { isolation?: 'read committed' | 'repeatable read' | 'serializable' },
): Promise<T> {
  return db.transaction(async (tx) => fn(tx as unknown as NodeTx), {
    isolationLevel: opts?.isolation,
  });
}

const DEFAULT_RETRY_CODES = new Set(['40001', '40P01']);

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: {
    attempts?: number;
    baseMs?: number;
    maxMs?: number;
    retryOn?: (e: unknown) => boolean;
  },
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  const baseMs = opts?.baseMs ?? 10;
  const maxMs = opts?.maxMs ?? 1_000;
  const retryOn =
    opts?.retryOn ??
    ((e) => {
      const code = (e as { code?: unknown } | null)?.code;
      return typeof code === 'string' && DEFAULT_RETRY_CODES.has(code);
    });
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !retryOn(err)) throw err;
      const delay = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
