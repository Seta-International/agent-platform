import type { AppManifest } from '@seta/module-sdk';
import { adminAppManifest } from '@seta/web-admin';
import { agentAppManifest } from '@seta/web-agent';
import { peopleAppManifest } from '@seta/web-people';
import { plannerAppManifest } from '@seta/web-planner';
// MODULE_MANIFEST_IMPORTS_END — generator inserts new AppManifest imports above this comment.

export const ALL_MANIFESTS: ReadonlyArray<AppManifest> = [
  agentAppManifest,
  plannerAppManifest,
  adminAppManifest,
  peopleAppManifest,
  // MODULE_MANIFEST_REGISTRATIONS_END — generator inserts new AppManifest entries above this comment.
];
