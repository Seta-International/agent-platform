import { VStack } from '@seta/shared-ui';

/**
 * SCR-02 Reviews home — intentionally empty for now. The role dashboard (KPI
 * tiles, pillar scores, roll-ups) lands in a separate ticket; this keeps the
 * mount point so the shell tabs and routing stay wired.
 */
export function PerformanceHome() {
  return <VStack data-testid="performance-home" />;
}
