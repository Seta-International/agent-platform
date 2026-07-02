import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';

export type { KnowledgePermission } from './generated/rbac.ts';
export { KNOWLEDGE_PERMISSIONS } from './generated/rbac.ts';

// biome-ignore lint/style/noNonNullAssertion: 'knowledge' is always in INVENTORY (asserted by codegen-drift.test.ts)
export const knowledgeRbac = inventoryToManifests(INVENTORY).find((m) => m.module === 'knowledge')!;
