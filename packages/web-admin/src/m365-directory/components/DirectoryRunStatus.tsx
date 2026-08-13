import { Banner, Grid, HStack, Text, Timestamp, VStack } from '@seta/shared-ui';
import type { DirectorySyncStatus } from '../api/directory-sync-client.ts';
import { COUNTER_LABELS } from './conflict-copy.ts';

export interface DirectoryRunStatusProps {
  status: DirectorySyncStatus | undefined;
  isLoading: boolean;
  /** A run this admin just started, or one the cron is working through. */
  isRunInFlight: boolean;
  /** Failure to reach the status endpoint — distinct from a run that failed. */
  error: Error | null;
  /** Failure to enqueue a run. */
  startError: Error | null;
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <VStack gap={0}>
      {/* Tabular figures so a column of counters lines up on the digit, not the glyph width. */}
      <Text weight="semibold" style={{ fontVariantNumeric: 'tabular-nums' }} display="block">
        {value}
      </Text>
      <Text type="supporting" color="secondary" display="block">
        {label}
      </Text>
    </VStack>
  );
}

/**
 * Design §9.3's run-status region: when the last run happened, how it ended, and the §11 counters.
 *
 * The counters come from the last `integrations.m365.directory.synced` event, so they describe the
 * last run that got far enough to emit — a failed run leaves the previous run's numbers standing,
 * which is why the outcome line is stated separately rather than inferred from them.
 */
export function DirectoryRunStatus({
  status,
  isLoading,
  isRunInFlight,
  error,
  startError,
}: DirectoryRunStatusProps) {
  if (error) {
    return <Banner status="error" title={`Could not read the sync status: ${error.message}`} />;
  }
  if (isLoading || !status) {
    return (
      <Text color="secondary" display="block">
        Loading sync status…
      </Text>
    );
  }

  const counters = status.last_run?.counters ?? {};
  const shown = COUNTER_LABELS.filter(({ key }) => key in counters);

  return (
    <VStack gap={4}>
      {startError && (
        <Banner status="error" title={`Could not start a run: ${startError.message}`} />
      )}

      {!status.configured && (
        <Banner
          status="info"
          title="Microsoft 365 is not connected yet. Connect it under Sign-in & SSO, and the nightly directory sync starts from there."
        />
      )}

      {status.last_status === 'error' && (
        <Banner
          status="error"
          title={`The last run failed: ${status.last_error ?? 'no reason recorded'}`}
        />
      )}

      <HStack gap={2} vAlign="center">
        <Text color="secondary">Last run</Text>
        {status.last_synced_at ? (
          <Text weight="semibold">
            {/* `hasTooltip` defaults to true and lazy-imports '../Tooltip/Tooltip' with no
                extension, which Node's ESM resolver cannot load — it crashes the tree under
                vitest. The `<time datetime>` attribute already carries the exact instant. */}
            <Timestamp value={status.last_synced_at} format="auto" hasTooltip={false} />
          </Text>
        ) : (
          <Text weight="semibold">never</Text>
        )}
        {status.last_run && (
          <Text type="supporting" color="secondary">
            · {status.last_run.full ? 'full census' : 'incremental'}
          </Text>
        )}
        {isRunInFlight && (
          <Text type="supporting" color="secondary">
            · a run is in progress
          </Text>
        )}
      </HStack>

      {shown.length > 0 ? (
        <Grid columns={4} gap={4}>
          {shown.map(({ key, label }) => (
            <Counter key={key} label={label} value={counters[key] ?? 0} />
          ))}
        </Grid>
      ) : (
        <Text type="supporting" color="secondary" display="block">
          No run has reported counters yet. They appear here after the first successful sync.
        </Text>
      )}
    </VStack>
  );
}
