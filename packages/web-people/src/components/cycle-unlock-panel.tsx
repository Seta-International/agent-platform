import {
  Badge,
  Button,
  Card,
  Divider,
  HStack,
  Spinner,
  StatusDot,
  Text,
  Textarea,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { relockCycle, unlockCycle } from '../api/people-client.ts';
import { cycleUnlocksOptions } from '../api/performance-query.ts';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';
import { performanceKeys } from '../state/performance-query-keys.ts';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/**
 * PMO manual cycle-unlock control (FUT-781). Reopens the whole review month for
 * corrections outside the normal window, then re-locks it. Every action needs a
 * reason and is appended to an immutable trail. Rendered only for holders of
 * `people.performance.unlock`; the server re-checks the permission on every call.
 */
export function CycleUnlockPanel({ month }: { month: string }) {
  const cycleLabel = formatPerformanceMonth(month);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const log = useQuery(cycleUnlocksOptions(month));
  const entries = log.data?.entries ?? [];
  // Entries are newest-first; the latest month-wide row is the current state.
  const monthUnlocked = entries.find((e) => e.scope_kind === 'month')?.action === 'unlock';

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: performanceKeys.cycleUnlocks(month) }),
      queryClient.invalidateQueries({ queryKey: performanceKeys.cycleStatus(month) }),
    ]);
  };

  const mutation = useMutation({
    mutationFn: () => {
      const body = { month, scope_kind: 'month' as const, scope_id: null, reason: reason.trim() };
      return monthUnlocked ? relockCycle(body) : unlockCycle(body);
    },
    onSuccess: async () => {
      toast({ body: monthUnlocked ? `Re-locked ${cycleLabel}` : `Unlocked ${cycleLabel}` });
      setReason('');
      await refresh();
    },
    onError: async (e: Error) => {
      // A CONFLICT means another tab changed the state — refresh so the control matches reality.
      toast({ body: e.message || 'Could not update the cycle. Reload and try again.' });
      await refresh();
    },
  });

  const reasonMissing = reason.trim().length === 0;

  return (
    <Card padding={4} data-testid="cycle-unlock-panel">
      <VStack gap={3}>
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
          <Text as="h2" size="lg" weight="semibold">
            Manual cycle unlock
          </Text>
          <HStack gap={2} vAlign="center">
            <StatusDot
              variant={monthUnlocked ? 'warning' : 'neutral'}
              label={monthUnlocked ? 'Unlocked' : 'Locked'}
            />
            <Text size="sm" weight="medium">
              {monthUnlocked ? 'Unlocked' : 'Locked'}
            </Text>
          </HStack>
        </HStack>

        <Text size="sm" color="secondary">
          {monthUnlocked
            ? `${cycleLabel} is open for corrections outside the normal window. Re-lock it when you're done.`
            : `Reopen ${cycleLabel} so evaluations can be made or corrected outside the normal window.`}
        </Text>

        <Textarea
          label="Reason"
          isRequired
          value={reason}
          onChange={(value) => setReason(value)}
          placeholder={
            monthUnlocked
              ? 'Why are you re-locking this cycle?'
              : 'Why does this cycle need to be reopened?'
          }
          rows={2}
          isDisabled={mutation.isPending}
        />
        <HStack hAlign="end">
          <Button
            variant={monthUnlocked ? 'destructive' : 'primary'}
            label={
              mutation.isPending
                ? monthUnlocked
                  ? 'Re-locking…'
                  : 'Unlocking…'
                : monthUnlocked
                  ? `Re-lock ${cycleLabel}`
                  : `Unlock ${cycleLabel}`
            }
            onClick={() => mutation.mutate()}
            isDisabled={mutation.isPending || reasonMissing}
          />
        </HStack>

        <Divider />

        <Text as="h3" size="sm" weight="semibold" color="secondary">
          Activity
        </Text>
        {log.isPending ? (
          <Spinner label="Loading unlock activity" />
        ) : entries.length === 0 ? (
          <Text size="sm" color="secondary">
            No unlock activity for {cycleLabel} yet.
          </Text>
        ) : (
          <VStack gap={2} as="ul" data-testid="cycle-unlock-trail">
            {entries.map((e) => (
              <HStack key={e.id} as="li" gap={2} vAlign="start" wrap="wrap">
                <Badge
                  variant={e.action === 'unlock' ? 'warning' : 'neutral'}
                  label={e.action === 'unlock' ? 'Unlocked' : 'Re-locked'}
                />
                <VStack gap={0}>
                  <Text size="sm">{e.reason}</Text>
                  <Text size="xsm" color="secondary">
                    {formatWhen(e.created_at)}
                  </Text>
                </VStack>
              </HStack>
            ))}
          </VStack>
        )}
      </VStack>
    </Card>
  );
}
