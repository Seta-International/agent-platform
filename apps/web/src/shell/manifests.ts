import type { AppManifest } from '@seta/module-sdk';
import { agentAppManifest } from '@seta/web-agent';
import { adminNavManifest } from '@/modules/admin';
import { plannerNavManifest } from '@/modules/planner';
// MODULE_MANIFEST_IMPORTS_END — generator inserts new navManifest imports above this comment.

export const ALL_MANIFESTS: ReadonlyArray<AppManifest> = [
  agentAppManifest,
  plannerNavManifest,
  adminNavManifest,
  // MODULE_MANIFEST_REGISTRATIONS_END — generator inserts new navManifest entries above this comment.
];
