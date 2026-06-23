import {
  Alert,
  AlertDescription,
  AsyncCombobox,
  Badge,
  Card,
  Label,
  PageChrome,
  Skeleton,
  Switch,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  type FeatureFlagView,
  listFeatureFlags,
  setFeatureFlag,
} from '../api/feature-flags-client.ts';
import { useMemberSearch } from '../api/member-search.ts';

const flagsKey = ['admin', 'feature-flags'] as const;

function buildStrategies(enabledForAll: boolean, userIds: string[]) {
  const out: { kind: string; config?: Record<string, unknown> }[] = [];
  if (enabledForAll) out.push({ kind: 'enabled' });
  if (userIds.length > 0) out.push({ kind: 'member-allowlist', config: { userIds } });
  return out;
}

function FlagRow({ flag }: { flag: FeatureFlagView }) {
  const qc = useQueryClient();
  const memberPicker = useMemberSearch();
  const [enabledForAll, setEnabledForAll] = useState(flag.enabled_for_all);
  const [userIds, setUserIds] = useState<string[]>(flag.allowlist_user_ids);

  const save = useMutation({
    mutationFn: (next: { enabledForAll: boolean; userIds: string[] }) =>
      setFeatureFlag(flag.key, buildStrategies(next.enabledForAll, next.userIds)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: flagsKey }),
  });

  const switchId = `flag-enabled-all-${flag.key}`;

  return (
    <Card className="p-5">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-body font-medium text-ink">{flag.key}</span>
              <Badge
                variant={flag.usage.health === 'active' ? 'default' : 'secondary'}
                className="text-caption"
              >
                {flag.usage.health === 'active' ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="mt-1 text-body-sm text-ink-subtle">{flag.description}</p>
            <p className="mt-0.5 text-caption text-ink-tertiary">
              {flag.usage.adoption_count}/{flag.usage.total_evaluated} evaluated (
              {flag.usage.adoption_pct}%)
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border border-hairline bg-surface-2 px-4 py-3">
          <Label htmlFor={switchId} className="cursor-pointer text-body-sm text-ink">
            Live for everyone in this tenant
          </Label>
          <Switch
            id={switchId}
            checked={enabledForAll}
            disabled={save.isPending}
            onCheckedChange={(checked) => {
              setEnabledForAll(checked);
              save.mutate({ enabledForAll: checked, userIds });
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-body-sm text-ink">Allowlist (cohort)</Label>
          <AsyncCombobox
            multiple
            value={userIds}
            onChange={(next) => {
              setUserIds(next);
              save.mutate({ enabledForAll, userIds: next });
            }}
            search={memberPicker.search}
            resolveByIds={memberPicker.resolveByIds}
            placeholder="Search members…"
          />
        </div>

        {save.error && (
          <p className="text-body-sm text-destructive">{(save.error as Error).message}</p>
        )}
      </div>
    </Card>
  );
}

export function FeatureFlags() {
  const { data, isLoading, error } = useQuery<FeatureFlagView[]>({
    queryKey: flagsKey,
    queryFn: listFeatureFlags,
  });

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Feature flags"
      subtitle="Control which features are live per tenant and per member."
    >
      <div className="page-container space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          (data ?? []).map((flag) => <FlagRow key={flag.key} flag={flag} />)
        )}

        {!isLoading && !error && (data ?? []).length === 0 && (
          <p className="text-body-sm text-ink-tertiary">No feature flags registered.</p>
        )}
      </div>
    </PageChrome>
  );
}
