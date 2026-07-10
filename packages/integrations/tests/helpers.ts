import { scoped } from '@seta/shared-db';

/**
 * sessionMiddleware (packages/core/src/middleware/session.ts) opens scoped(tenantId, ...)
 * around every authenticated request, so any integrations domain function reached directly
 * by a test — bypassing HTTP — needs the same context opened around it.
 */
export function inScope<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return scoped(tenantId, fn);
}
