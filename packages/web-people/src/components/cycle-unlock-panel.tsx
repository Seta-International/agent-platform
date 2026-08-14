import {
  Badge,
  Button,
  Card,
  Divider,
  HStack,
  Selector,
  Spinner,
  Text,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CycleUnlockAccountState } from '../api/people-client.ts';
import { relockCycle, unlockCycle } from '../api/people-client.ts';
import { cycleUnlockPanelOptions } from '../api/performance-query.ts';
import { formatPerformanceMonth } from '../nav/performance-dashboard.ts';
import { performanceKeys } from '../state/performance-query-keys.ts';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/** "2 days left" / "6 hours left" — how long an open window still has to run. */
function remaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'expired';
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} left`;
  const days = Math.ceil(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} left`;
}

/**
 * PMO manual cycle unlock (FUT-781). Reopens one account's review month for up to
 * five days so missed evaluations can be corrected, then closes by itself. Only the
 * latest closed cycle can be reopened — earlier months are signed off and read-only.
 * Lives on its own Performance tab, gated on `people.performance.unlock`; the server
 * re-checks the permission on every call and appends each action to the trail below.
 */
export function CycleUnlockPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [days, setDays] = useState(3);

  const panel = useQuery(cycleUnlockPanelOptions());

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: performanceKeys.cycleUnlocks() }),
      queryClient.invalidateQueries({ queryKey: performanceKeys.all }),
    ]);

  const month = panel.data?.unlockable_month ?? null;
  const maxDays = panel.data?.max_days ?? 5;
  const accounts = panel.data?.accounts ?? [];
  const selected: CycleUnlockAccountState | null =
    accounts.find((a) => a.account_id === accountId) ?? accounts[0] ?? null;
  const isOpen = selected?.unlocked_until != null;

  const mutation = useMutation({
    mutationFn: () => {
      if (!month || !selected) throw new Error('Pick an account first.');
      return isOpen
        ? relockCycle({ month, account_id: selected.account_id })
        : unlockCycle({ month, account_id: selected.account_id, days });
    },
    onSuccess: async () => {
      toast({
        body: isOpen
          ? `Closed ${selected?.name ?? 'the account'}`
          : `Reopened ${selected?.name ?? 'the account'} for ${days} day${days === 1 ? '' : 's'}`,
      });
      await refresh();
    },
    onError: async (e: Error) => {
      // A CONFLICT means another tab already changed this account — resync the panel.
      toast({ body: e.message || 'Could not update the cycle. Reload and try again.' });
      await refresh();
    },
  });

  if (panel.isPending) {
    return (
      <Card padding={4} data-testid="cycle-unlock-panel">
        <Spinner label="Loading cycle unlock" />
      </Card>
    );
  }
  if (panel.isError || !panel.data || !month) {
    return (
      <Card padding={4} data-testid="cycle-unlock-panel">
        <Text color="secondary">Couldn't load the cycle unlock controls.</Text>
      </Card>
    );
  }

  const cycleLabel = formatPerformanceMonth(month);
  const openCount = accounts.filter((a) => a.unlocked_until).length;

  return (
    <Card padding={4} data-testid="cycle-unlock-panel">
      <VStack gap={3}>
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
          <Text as="h2" size="lg" weight="semibold">
            Reopen {cycleLabel}
          </Text>
          {openCount > 0 ? (
            <Badge
              variant="warning"
              label={`${openCount} account${openCount === 1 ? '' : 's'} open`}
            />
          ) : null}
        </HStack>

        <Text size="sm" color="secondary">
          {cycleLabel} is the last cycle that can still be corrected. Reopening an account lets its
          evaluations be edited for up to {maxDays} days, then it closes on its own. Earlier months
          are final.
        </Text>

        <HStack gap={3} vAlign="end" wrap="wrap">
          <Selector
            label="Account"
            options={accounts.map((a) => ({
              value: a.account_id,
              label: a.unlocked_until ? `${a.name} — open` : a.name,
            }))}
            value={selected?.account_id ?? ''}
            onChange={(next) => setAccountId(next)}
          />
          {isOpen ? null : (
            <Selector
              label="Reopen for"
              options={Array.from({ length: maxDays }, (_, i) => ({
                value: String(i + 1),
                label: `${i + 1} day${i === 0 ? '' : 's'}`,
              }))}
              value={String(days)}
              onChange={(next) => setDays(Number(next))}
            />
          )}
          <Button
            variant={isOpen ? 'destructive' : 'primary'}
            label={
              mutation.isPending
                ? isOpen
                  ? 'Closing…'
                  : 'Reopening…'
                : isOpen
                  ? 'Close now'
                  : 'Reopen account'
            }
            onClick={() => mutation.mutate()}
            isDisabled={mutation.isPending || !selected}
          />
        </HStack>

        {isOpen && selected?.unlocked_until ? (
          <Text size="sm">
            {selected.name} is open until {formatWhen(selected.unlocked_until)} (
            {remaining(selected.unlocked_until)}).
          </Text>
        ) : null}

        <Divider />

        <Text as="h3" size="sm" weight="semibold" color="secondary">
          Activity
        </Text>
        {panel.data.entries.length === 0 ? (
          <Text size="sm" color="secondary">
            Nothing has been reopened for {cycleLabel}.
          </Text>
        ) : (
          <VStack gap={2} data-testid="cycle-unlock-trail">
            {panel.data.entries.map((e) => {
              const account = accounts.find((a) => a.account_id === e.account_id);
              return (
                <HStack key={e.id} gap={2} vAlign="center" wrap="wrap">
                  <Badge
                    variant={e.action === 'unlock' ? 'warning' : 'neutral'}
                    label={e.action === 'unlock' ? 'Reopened' : 'Closed'}
                  />
                  <Text size="sm">{account?.name ?? 'Account'}</Text>
                  <Text size="xsm" color="secondary">
                    {formatWhen(e.created_at)}
                    {e.expires_at ? ` · until ${formatWhen(e.expires_at)}` : ''}
                  </Text>
                </HStack>
              );
            })}
          </VStack>
        )}
      </VStack>
    </Card>
  );
}
