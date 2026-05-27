import type { NavManifest } from '@seta/module-sdk';
import { adminNavManifest } from '@/modules/admin';
import { agentNavManifest } from '@/modules/agent';
import { plannerNavManifest } from '@/modules/planner';
// MODULE_MANIFEST_IMPORTS_END — generator inserts new navManifest imports above this comment.

export const ALL_MANIFESTS: ReadonlyArray<NavManifest> = [
  agentNavManifest,
  plannerNavManifest,
  adminNavManifest,
  // MODULE_MANIFEST_REGISTRATIONS_END — generator inserts new navManifest entries above this comment.
];
