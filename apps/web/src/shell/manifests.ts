import type { NavManifest } from '@seta/module-sdk';
import { adminNavManifest } from '@/modules/admin';
import { agentNavManifest } from '@/modules/agent';
import { ariaNavManifest } from '@/modules/aria';
import { devzoneNavManifest } from '@/modules/devzone';
import { plannerNavManifest } from '@/modules/planner';
// MODULE_MANIFEST_IMPORTS_END — generator inserts new navManifest imports above this comment.

export const ALL_MANIFESTS: ReadonlyArray<NavManifest> = [
  agentNavManifest,
  plannerNavManifest,
  ariaNavManifest,
  adminNavManifest,
  devzoneNavManifest,
  // MODULE_MANIFEST_REGISTRATIONS_END — generator inserts new navManifest entries above this comment.
];
