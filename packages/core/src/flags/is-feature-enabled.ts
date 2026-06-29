// packages/core/src/flags/is-feature-enabled.ts
import type { SessionScope } from '../session/scope.ts';

export function isFeatureEnabled(session: SessionScope, key: string): boolean {
  return session.features.has(key);
}
