import type { AppManifest } from '@seta/module-sdk';
import { agentAppManifest } from '@seta/web-agent';
import { plannerAppManifest } from '@seta/web-planner';
import { adminNavManifest } from '@/modules/admin';
// MODULE_MANIFEST_IMPORTS_END — generator inserts new navManifest imports above this comment.

export const ALL_MANIFESTS: ReadonlyArray<AppManifest> = [
  agentAppManifest,
  plannerAppManifest,
  adminNavManifest,
  // MODULE_MANIFEST_REGISTRATIONS_END — generator inserts new navManifest entries above this comment.
];
