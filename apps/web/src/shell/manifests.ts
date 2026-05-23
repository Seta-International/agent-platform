import type { NavManifest } from '@seta/module-sdk';
import { consoleNavManifest } from '@/modules/console';
import { copilotNavManifest } from '@/modules/copilot';
import { plannerNavManifest } from '@/modules/planner';

export const ALL_MANIFESTS: ReadonlyArray<NavManifest> = [
  copilotNavManifest,
  plannerNavManifest,
  consoleNavManifest,
];
