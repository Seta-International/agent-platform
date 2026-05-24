// Deferred: Redis-backed bucket for multi-process deployments (single-process in-memory is sufficient for v1)

const CAPACITY = 10;
const REFILL_PER_MS = 10 / 1000; // 0.01 tokens per ms = 10 tokens/sec

interface BucketState {
  tokens: number;
  lastRefillAt: number;
}

const buckets = new Map<string, BucketState>();

/**
 * Acquires one token for the given tenant key, waiting if the bucket is empty.
 * Uses lazy refill: elapsed time since last access is converted to tokens on each call.
 * Per-tenant isolation ensures one tenant's load does not throttle another.
 */
export async function acquireToken(key: string): Promise<void> {
  const now = performance.now();
  const state = buckets.get(key) ?? { tokens: CAPACITY, lastRefillAt: now };

  const elapsed = now - state.lastRefillAt;
  state.tokens = Math.min(CAPACITY, state.tokens + elapsed * REFILL_PER_MS);
  state.lastRefillAt = now;

  if (state.tokens >= 1) {
    state.tokens -= 1;
    buckets.set(key, state);
    return;
  }

  // Compute wait time for the next token and sleep
  const waitMs = (1 - state.tokens) / REFILL_PER_MS;
  buckets.set(key, state);
  await new Promise<void>((resolve) => setTimeout(resolve, Math.ceil(waitMs)));
  // Recurse to take the token — single-threaded JS guarantees no concurrent refill
  return acquireToken(key);
}

/** Only for test isolation — clears all in-memory bucket state. */
export function _resetBucketsForTesting(): void {
  buckets.clear();
}
