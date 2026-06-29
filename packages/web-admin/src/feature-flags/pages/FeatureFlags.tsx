import {
  Alert,
  AlertDescription,
  AsyncCombobox,
  Card,
  cn,
  formatRelative,
  Label,
  PageChrome,
  SegmentedControl,
  Skeleton,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Globe, Loader2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  type FeatureFlagView,
  listFeatureFlags,
  setFeatureFlag,
} from '../api/feature-flags-client.ts';
import { useMemberSearch } from '../api/member-search.ts';

const flagsKey = ['admin', 'feature-flags'] as const;

type Mode = 'off' | 'cohort' | 'everyone';

/**
 * The effective rollout the admin sees. A non-overridden default-ON flag is
 * live for everyone even with no row, so it must read as `everyone`, not `off`.
 */
function deriveMode(flag: FeatureFlagView): Mode {
  if (flag.enabled_for_all) return 'everyone';
  if (flag.allowlist_user_ids.length > 0) return 'cohort';
  if (!flag.is_overridden && flag.default_enabled) return 'everyone';
  return 'off';
}

function strategiesForMode(mode: Mode, userIds: string[]) {
  if (mode === 'everyone') return [{ kind: 'enabled' }];
  if (mode === 'cohort') return [{ kind: 'member-allowlist', config: { userIds } }];
  return [];
}

const MODE_ACCENT: Record<Mode, string> = {
  everyone: 'var(--color-success)',
  cohort: 'var(--color-info)',
  off: 'var(--color-ink-tertiary)',
};

function StateTag({ mode }: { mode: Mode }) {
  const map: Record<Mode, { text: string; bg: string; color: string }> = {
    everyone: { text: 'Live', bg: 'var(--color-success-tint)', color: 'var(--color-success-ink)' },
    cohort: { text: 'Ramping', bg: 'var(--color-info-tint)', color: 'var(--color-info-ink)' },
    off: { text: 'Off', bg: 'var(--color-surface-3)', color: 'var(--color-ink-tertiary)' },
  };
  const m = map[mode];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium"
      style={{ background: m.bg, color: m.color }}
    >
      {m.text}
    </span>
  );
}

function lastSeen(ts: string | null): string | null {
  if (!ts) return null;
  const rel = formatRelative(ts);
  return rel === 'now' ? 'last seen just now' : `last seen ${rel} ago`;
}

function FlagRow({ flag }: { flag: FeatureFlagView }) {
  const qc = useQueryClient();
  const memberPicker = useMemberSearch();
  const [mode, setMode] = useState<Mode>(deriveMode(flag));
  const [userIds, setUserIds] = useState<string[]>(flag.allowlist_user_ids);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (next: { mode: Mode; userIds: string[] }) =>
      setFeatureFlag(flag.key, strategiesForMode(next.mode, next.userIds)),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      void qc.invalidateQueries({ queryKey: flagsKey });
    },
  });

  const commit = (next: { mode?: Mode; userIds?: string[] }) => {
    const m = next.mode ?? mode;
    const ids = next.userIds ?? userIds;
    if (next.mode !== undefined) setMode(next.mode);
    if (next.userIds !== undefined) setUserIds(next.userIds);
    save.mutate({ mode: m, userIds: ids });
  };

  const u = flag.usage;
  const seen = lastSeen(u.last_evaluated_at);

  return (
    <Card className="flex gap-0 overflow-hidden p-0 transition-colors hover:border-hairline-strong">
      <div className="w-1 flex-none self-stretch" style={{ background: MODE_ACCENT[mode] }} />
      <div className="min-w-0 flex-1 space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-body-sm font-semibold text-ink">{flag.key}</span>
              <StateTag mode={mode} />
              {!flag.is_overridden && (
                <span className="text-caption text-ink-tertiary">
                  default · {flag.default_enabled ? 'on' : 'off'}
                </span>
              )}
            </div>
            <p className="mt-1 text-body-sm text-ink-subtle">{flag.description}</p>
          </div>

          <SegmentedControl
            aria-label={`Rollout for ${flag.key}`}
            value={mode}
            onValueChange={(m) => commit({ mode: m })}
            size="md"
            options={[
              { value: 'off', label: 'Off', icon: <Ban className="size-3.5" aria-hidden /> },
              {
                value: 'cohort',
                label: 'Cohort',
                icon: <Users className="size-3.5" aria-hidden />,
              },
              {
                value: 'everyone',
                label: 'Everyone',
                icon: <Globe className="size-3.5" aria-hidden />,
              },
            ]}
          />
        </div>

        {mode === 'cohort' && (
          <div className="space-y-1.5 rounded-md border border-hairline bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-eyebrow uppercase tracking-[0.04em] text-ink-tertiary">
                Allowlist cohort
              </Label>
              <span className="text-caption text-ink-subtle">
                {userIds.length} member{userIds.length === 1 ? '' : 's'}
              </span>
            </div>
            <AsyncCombobox
              multiple
              value={userIds}
              onChange={(next) => commit({ userIds: next })}
              search={memberPicker.search}
              resolveByIds={memberPicker.resolveByIds}
              placeholder="Search members to add…"
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-hairline-tertiary pt-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="h-1.5 w-28 flex-none overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${u.adoption_pct}%`, background: MODE_ACCENT[mode] }}
              />
            </div>
            <span className="whitespace-nowrap text-caption text-ink-subtle">
              {u.total_evaluated === 0
                ? 'No logins yet'
                : `${u.adoption_count} of ${u.total_evaluated} reached · ${u.adoption_pct}%`}
            </span>
            {seen && (
              <span className="hidden whitespace-nowrap text-caption text-ink-tertiary sm:inline">
                · {seen}
              </span>
            )}
          </div>

          <div className="flex flex-none items-center gap-2">
            {save.isPending ? (
              <span className="inline-flex items-center gap-1.5 text-caption text-ink-subtle">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Saving…
              </span>
            ) : save.error ? (
              <span className="text-caption text-destructive" title={(save.error as Error).message}>
                Couldn&apos;t save
              </span>
            ) : saved ? (
              <span
                className="inline-flex items-center gap-1.5 text-caption"
                style={{ color: 'var(--color-success-ink)' }}
              >
                <Check className="size-3" aria-hidden />
                Saved
              </span>
            ) : (
              <HealthTag health={u.health} evaluated={u.total_evaluated} />
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function HealthTag({ health, evaluated }: { health: 'active' | 'inactive'; evaluated: number }) {
  if (evaluated === 0) {
    return <span className="text-caption text-ink-tertiary">Awaiting first login</span>;
  }
  const active = health === 'active';
  const color = active ? 'var(--color-success)' : 'var(--color-ink-tertiary)';
  return (
    <span className="inline-flex items-center gap-1.5 text-caption" style={{ color }}>
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

type Filter = 'all' | Mode;

function SummaryStrip({
  total,
  counts,
  active,
  onPick,
}: {
  total: number;
  counts: Record<Mode, number>;
  active: Filter;
  onPick: (f: Filter) => void;
}) {
  const items: { key: Filter; label: string; value: number; dot: string }[] = [
    { key: 'all', label: 'All flags', value: total, dot: 'var(--color-ink-subtle)' },
    {
      key: 'everyone',
      label: 'Live for everyone',
      value: counts.everyone,
      dot: MODE_ACCENT.everyone,
    },
    { key: 'cohort', label: 'Ramping cohort', value: counts.cohort, dot: MODE_ACCENT.cohort },
    { key: 'off', label: 'Turned off', value: counts.off, dot: MODE_ACCENT.off },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => {
        const isActive = active === it.key;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onPick(it.key)}
            style={isActive ? { background: 'var(--color-primary-tint)' } : undefined}
            className={cn(
              'rounded-lg border px-4 py-3 text-left transition-colors',
              isActive
                ? 'border-primary'
                : 'border-hairline bg-canvas hover:border-hairline-strong',
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: it.dot }} aria-hidden />
              <span className="text-caption uppercase tracking-wide text-ink-subtle">
                {it.label}
              </span>
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{it.value}</div>
          </button>
        );
      })}
    </div>
  );
}

export function FeatureFlags() {
  const { data, isLoading, error } = useQuery<FeatureFlagView[]>({
    queryKey: flagsKey,
    queryFn: listFeatureFlags,
  });
  const [filter, setFilter] = useState<Filter>('all');

  const flags = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<Mode, number> = { everyone: 0, cohort: 0, off: 0 };
    for (const f of flags) c[deriveMode(f)] += 1;
    return c;
  }, [flags]);

  const visible = filter === 'all' ? flags : flags.filter((f) => deriveMode(f) === filter);

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Feature flags"
      subtitle="Turn modules on, or ramp them to a cohort before going live."
    >
      <div className="page-container space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Skeleton className="h-[68px] rounded-lg" />
              <Skeleton className="h-[68px] rounded-lg" />
              <Skeleton className="h-[68px] rounded-lg" />
              <Skeleton className="h-[68px] rounded-lg" />
            </div>
            <Skeleton className="h-32 w-full rounded-md" />
            <Skeleton className="h-32 w-full rounded-md" />
          </>
        ) : flags.length === 0 ? (
          <p className="text-body-sm text-ink-tertiary">No feature flags registered.</p>
        ) : (
          <>
            <SummaryStrip total={flags.length} counts={counts} active={filter} onPick={setFilter} />
            <div className="space-y-3">
              {visible.map((flag) => (
                <FlagRow key={flag.key} flag={flag} />
              ))}
              {visible.length === 0 && (
                <p className="rounded-md border border-dashed border-hairline px-4 py-8 text-center text-body-sm text-ink-tertiary">
                  No flags in this state.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </PageChrome>
  );
}
