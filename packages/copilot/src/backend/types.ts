// SessionLike now lives in @seta/copilot-sdk; this file re-exports the type so
// existing internal `import type { SessionLike } from './types.ts'` paths keep
// resolving. Safe to delete this re-export once every internal call site has
// been migrated.
export type { SessionLike } from '@seta/copilot-sdk';
