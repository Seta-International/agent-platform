import { Text, VStack } from '@seta/shared-ui';
import { CycleUnlockPanel } from '../components/cycle-unlock-panel.tsx';
import { usePerformanceScopeContext } from '../state/performance-scope-context.tsx';

/**
 * Cycle unlock workspace (FUT-781) — the PMO-only tab. The shell already redirects
 * anyone without `people.performance.unlock` back to Reviews, so this guard is only
 * the second line for a direct render; the server checks the permission again.
 */
export function CycleUnlockPage() {
  const { can_unlock } = usePerformanceScopeContext();
  if (!can_unlock) {
    return (
      <Text color="secondary" data-testid="cycle-unlock-denied">
        You don't have access to cycle unlock.
      </Text>
    );
  }
  return (
    <VStack gap={4} data-testid="cycle-unlock-page">
      <CycleUnlockPanel />
    </VStack>
  );
}
