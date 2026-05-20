export interface SsoProfileContext {
  seta_tenant_id: string;
  tid: string;
  email: string;
  name: string;
}

const stash = new Map<string, { ctx: SsoProfileContext; expires_at: number }>();
const TTL_MS = 60_000;
const CAP = 1_000;

export function stashSsoContext(oid: string, ctx: SsoProfileContext): void {
  if (stash.size >= CAP) {
    const drop = Math.ceil(CAP / 10);
    let n = 0;
    for (const k of stash.keys()) {
      stash.delete(k);
      if (++n >= drop) break;
    }
  }
  stash.set(oid, { ctx, expires_at: Date.now() + TTL_MS });
}

export function takeSsoContext(oid: string): SsoProfileContext | null {
  const entry = stash.get(oid);
  if (!entry) return null;
  stash.delete(oid);
  if (entry.expires_at < Date.now()) return null;
  return entry.ctx;
}

export function _resetSsoContextStashForTest(): void {
  stash.clear();
}
