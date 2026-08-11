import {
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  HStack,
  IconButton,
  Input,
  NumberInput,
  Spinner,
  Text,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PerformanceConfigGroup } from '../api/people-client.ts';
import { savePerformanceConfig } from '../api/people-client.ts';
import { performanceConfigOptions } from '../api/performance-query.ts';
import { validateConfigDraft, weightCents } from '../nav/performance-config-validation.ts';
import { performanceKeys } from '../state/performance-query-keys.ts';
import { usePerformanceScopeContext } from '../state/performance-scope-context.tsx';

type DraftCriterion = {
  key: string;
  name: string;
  weight: number;
  sort: number;
};

type DraftGroup = {
  group_id: string;
  code: string;
  name: string;
  sort: number;
  weight: number;
  criteria: DraftCriterion[];
};

function toDraft(groups: PerformanceConfigGroup[]): DraftGroup[] {
  return groups.map((g) => ({
    group_id: g.group_id,
    code: g.code,
    name: g.name,
    sort: g.sort,
    weight: g.weight,
    criteria: g.criteria.map((c) => ({
      key: c.id,
      name: c.name,
      weight: c.weight,
      sort: c.sort,
    })),
  }));
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value) || 0;
}

/** Percent without trailing zeros (e.g. 20, 12.5, 26.5, 12.05). */
function fmtPct(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.?0+$/, '');
}

function critCentsOf(g: DraftGroup): number {
  return g.criteria.reduce((s, c) => s + weightCents(c.weight), 0);
}

export function PerformanceConfigurationPage() {
  const { resolved } = usePerformanceScopeContext();
  const capacity = resolved.capacity;
  const isAm = capacity?.kind === 'am';
  const accountId = isAm ? capacity.account_id : '';
  const toast = useToast();
  const queryClient = useQueryClient();

  const q = useQuery({
    ...performanceConfigOptions(accountId || '00000000-0000-0000-0000-000000000000'),
    enabled: isAm,
  });
  const [draft, setDraft] = useState<DraftGroup[] | null>(null);
  const [revisionNo, setRevisionNo] = useState<number | null>(null);
  const [appliesNext, setAppliesNext] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(0);

  useEffect(() => {
    if (!q.data) return;
    setDraft(toDraft(q.data.groups));
    setRevisionNo(q.data.revision_no);
    setAppliesNext(q.data.applies_to_next_cycle);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!isAm || !draft || revisionNo == null) throw new Error('Nothing to save');
      const err = validateConfigDraft(draft);
      if (err) throw new Error(err);
      return savePerformanceConfig(accountId, {
        base_revision_no: revisionNo,
        groups: draft.map((g) => ({
          group_id: g.group_id,
          weight: g.weight,
          criteria: g.criteria.map((c) => ({
            name: c.name,
            weight: c.weight,
            sort: c.sort,
          })),
        })),
      });
    },
    onSuccess: async () => {
      toast({ body: 'Weights published' });
      await queryClient.invalidateQueries({ queryKey: performanceKeys.config(accountId) });
    },
    onError: (err: Error) => {
      const msg = err.message || 'Could not save configuration';
      toast({ body: msg, type: 'error' });
      if (/reload|mismatch|base_revision/i.test(msg)) {
        void queryClient.invalidateQueries({ queryKey: performanceKeys.config(accountId) });
      }
    },
  });

  if (!isAm) {
    return (
      <Text color="secondary" data-testid="performance-config-wrong-capacity">
        Switch to an Account Manager context to configure evaluation weights.
      </Text>
    );
  }

  if (q.isLoading || !draft) {
    return (
      <HStack hAlign="center" className="py-12" data-testid="performance-config-loading">
        <Spinner />
      </HStack>
    );
  }
  if (q.isError) {
    return (
      <Banner
        status="error"
        title={(q.error as Error).message || 'Failed to load configuration'}
        data-testid="performance-config-error"
      />
    );
  }

  const groupTotalCents = draft.reduce((s, g) => s + weightCents(g.weight), 0);
  const groupOk = groupTotalCents === 10_000;
  const invalidGroups = draft.filter((g) => critCentsOf(g) !== weightCents(g.weight));
  const allValid = groupOk && invalidGroups.length === 0;

  const summaryDescription = allValid
    ? 'Configuration is valid and applies to every project in this account.'
    : !groupOk
      ? 'Group weights must add up to 100% before you can publish this configuration.'
      : `Each group's criteria must total its group weight before you can publish (${invalidGroups
          .map((g) => g.name)
          .join(', ')}).`;

  const resetDraft = () => {
    if (!q.data) return;
    setDraft(toDraft(q.data.groups));
    setRevisionNo(q.data.revision_no);
    setAppliesNext(q.data.applies_to_next_cycle);
  };

  const patchGroup = (index: number, next: Partial<DraftGroup>) => {
    const target = draft[index];
    if (!target) return;
    const copy = [...draft];
    copy[index] = { ...target, ...next };
    setDraft(copy);
  };

  const sel = Math.min(selectedGroup, draft.length - 1);
  const active = draft[sel];
  if (!active) {
    return (
      <Text color="secondary" data-testid="performance-config-empty">
        No evaluation groups configured yet.
      </Text>
    );
  }
  const activeWeightCents = weightCents(active.weight);
  const activeCritCents = critCentsOf(active);
  const activeCritOk = activeCritCents === activeWeightCents;
  const activeDiffCents = activeWeightCents - activeCritCents;

  const patchActiveCriteria = (criteria: DraftCriterion[]) => {
    patchGroup(sel, { criteria });
  };

  return (
    <VStack gap={4} data-testid="performance-configuration">
      <Banner
        status={allValid ? 'success' : 'warning'}
        title={
          <VStack gap={0.5}>
            <Text weight="semibold">{`Group weights total ${fmtPct(groupTotalCents)}%`}</Text>
            <Text size="sm" color="secondary">
              {summaryDescription}
            </Text>
          </VStack>
        }
        endContent={
          <HStack gap={2} vAlign="center">
            <Button
              label="Reset"
              variant="ghost"
              isDisabled={save.isPending}
              onClick={resetDraft}
              data-testid="performance-config-reset"
            />
            <Button
              label={save.isPending ? 'Publishing…' : 'Publish weights'}
              variant="primary"
              isDisabled={save.isPending || !allValid}
              onClick={() => save.mutate()}
              data-testid="performance-config-publish"
            />
          </HStack>
        }
        data-testid="performance-config-summary"
      />

      {appliesNext ? (
        <Banner
          status="info"
          title="Applies to the next review cycle"
          description="The current open cycle keeps its pinned weights. Publishing sets the head for next month."
          data-testid="performance-config-next-cycle-banner"
        />
      ) : null}

      {/* Master–detail: group list (left) drives the criteria editor (right).
          Colour is reserved for validation state only — selection is neutral. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <Card
          padding={3}
          className="lg:w-96 lg:shrink-0"
          data-testid="performance-config-group-list"
        >
          <VStack gap={3}>
            <VStack gap={2}>
              <Text as="h2" size="base" weight="semibold">
                Performance Groups
              </Text>
              <Divider />
            </VStack>
            <VStack gap={1}>
              {draft.map((g, gi) => {
                const gwCents = weightCents(g.weight);
                const gcCents = critCentsOf(g);
                const gOk = gcCents === gwCents;
                const isSelected = gi === sel;
                return (
                  // The whole card is the selection control; neutral grey fill
                  // marks the active group (colour is reserved for validation).
                  <Card
                    key={g.group_id}
                    padding={2}
                    className="cursor-pointer"
                    style={
                      isSelected ? { backgroundColor: 'var(--color-background-gray)' } : undefined
                    }
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedGroup(gi)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedGroup(gi);
                      }
                    }}
                    data-testid={`performance-config-group-${g.code}`}
                  >
                    <HStack hAlign="between" vAlign="center" gap={2}>
                      <VStack gap={1} hAlign="start" className="min-w-0">
                        <Text weight={isSelected ? 'semibold' : 'medium'} className="truncate">
                          {g.name}
                        </Text>
                        {gOk ? null : (
                          <Badge
                            variant="warning"
                            label={`Criteria ${fmtPct(gcCents)} / ${fmtPct(gwCents)}%`}
                          />
                        )}
                      </VStack>
                      <NumberInput
                        label={`${g.name} group weight`}
                        isLabelHidden
                        units="%"
                        width={96}
                        value={g.weight}
                        min={0}
                        max={100}
                        step={0.5}
                        onChange={(value) => patchGroup(gi, { weight: asNumber(value) })}
                      />
                    </HStack>
                  </Card>
                );
              })}
            </VStack>
            <Text size="sm" color="secondary">
              Group weights must total 100%. Now {fmtPct(groupTotalCents)}%.
            </Text>
          </VStack>
        </Card>

        <Card
          padding={4}
          className="min-w-0 lg:flex-1"
          data-testid="performance-config-criteria-panel"
        >
          <VStack gap={3}>
            <VStack gap={2}>
              <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
                <Text as="h2" size="lg" weight="semibold">
                  Group Criteria: {active.name}
                </Text>
                {activeCritOk ? (
                  <Text size="sm" color="secondary">
                    {`${fmtPct(activeCritCents)} / ${fmtPct(activeWeightCents)}%`}
                  </Text>
                ) : (
                  <Badge
                    variant="warning"
                    label={`${fmtPct(activeCritCents)} / ${fmtPct(activeWeightCents)}%`}
                  />
                )}
              </HStack>
              <Divider />
            </VStack>

            {active.criteria.length === 0 ? (
              <Text size="sm" color="secondary">
                No criteria yet — add at least one so the group weight is distributed.
              </Text>
            ) : (
              <VStack gap={2}>
                {active.criteria.map((c, ci) => (
                  <Card key={`${active.group_id}:${c.key}`} padding={3} className="row-fade-in">
                    <HStack hAlign="between" vAlign="end" gap={3} wrap="wrap">
                      <div className="min-w-56 flex-1">
                        <Input
                          label="Criterion"
                          value={c.name}
                          onChange={(name) => {
                            const criteria = [...active.criteria];
                            criteria[ci] = { ...c, name };
                            patchActiveCriteria(criteria);
                          }}
                        />
                      </div>
                      <NumberInput
                        label="Weight"
                        units="%"
                        width={120}
                        value={c.weight}
                        min={0}
                        max={100}
                        step={0.5}
                        onChange={(value) => {
                          const criteria = [...active.criteria];
                          criteria[ci] = { ...c, weight: asNumber(value) };
                          patchActiveCriteria(criteria);
                        }}
                      />
                      <IconButton
                        label={`Remove ${c.name || 'criterion'}`}
                        icon={<Trash2 size={16} />}
                        variant="ghost"
                        onClick={() =>
                          patchActiveCriteria(active.criteria.filter((_, i) => i !== ci))
                        }
                      />
                    </HStack>
                  </Card>
                ))}
              </VStack>
            )}

            <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
              <Button
                label="Add criterion"
                variant="secondary"
                icon={<Plus size={16} />}
                onClick={() =>
                  patchActiveCriteria([
                    ...active.criteria,
                    {
                      key: crypto.randomUUID(),
                      name: 'New criterion',
                      weight: 0,
                      sort: active.criteria.length,
                    },
                  ])
                }
                data-testid="performance-config-add-criterion"
              />
              {activeCritOk ? null : (
                <Text
                  size="sm"
                  color="secondary"
                  data-testid={`performance-config-crit-hint-${active.code}`}
                >
                  {activeDiffCents > 0
                    ? `Add ${fmtPct(activeDiffCents)}% to match the group weight.`
                    : `Remove ${fmtPct(-activeDiffCents)}% — criteria exceed the group weight.`}
                </Text>
              )}
            </HStack>
          </VStack>
        </Card>
      </div>
    </VStack>
  );
}
