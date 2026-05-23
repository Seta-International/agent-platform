import type { NavManifest } from '@seta/module-sdk';
import { consoleNavManifest } from '@/modules/console';
import { copilotNavManifest } from '@/modules/copilot';
import { plannerNavManifest } from '@/modules/planner';
// MODULE_MANIFEST_IMPORTS_END — generator inserts new navManifest imports above this comment.

export const ALL_MANIFESTS: ReadonlyArray<NavManifest> = [
  copilotNavManifest,
  plannerNavManifest,
  consoleNavManifest,
  // MODULE_MANIFEST_REGISTRATIONS_END — generator inserts new navManifest entries above this comment.
];
