import { INVENTORY, inventoryToManifests } from '@seta/shared-rbac';

export type { AgentPermission } from './generated/rbac.ts';
export { AGENT_PERMISSIONS } from './generated/rbac.ts';

// biome-ignore lint/style/noNonNullAssertion: 'agent' is always in INVENTORY (asserted by codegen-drift.test.ts)
export const agentRbac = inventoryToManifests(INVENTORY).find((m) => m.module === 'agent')!;
