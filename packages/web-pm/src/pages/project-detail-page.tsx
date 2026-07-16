import {
  Badge,
  Banner,
  Button,
  Card,
  CardTitle,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageChrome,
  Selector,
  Skeleton,
  Textarea,
  Typeahead,
  useSeededItem,
  useToast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { orgUnitSearch } from '../api/org-unit-search.ts';
import { createPlannerGroup, fetchPlannerGroups } from '../api/planner-client.ts';
import {
  closeProject,
  editProject,
  fetchProject,
  linkPlannerGroup,
  type ProjectDetail,
  type ProjectPatch,
  reopenProject,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import { ProjectAccessSection } from './project-access-section.tsx';
import { StaffingPlanSection } from './staffing-plan-section.tsx';

const PHASES = ['initiation', 'discovery', 'execution', 'stabilize', 'uat', 'closed'] as const;
const STATUSES = ['active', 'on_hold', 'closed'] as const;

const STATUS_VARIANT: Record<ProjectDetail['status'], 'neutral' | 'success'> = {
  active: 'success',
  on_hold: 'neutral',
  closed: 'neutral',
};

export function ProjectDetailPage() {
  const { projectId } = useParams({ from: '/_authed/pm/projects/$projectId' });
  const queryClient = useQueryClient();
  const canManage = usePermission('pm.project.manage');
  const toast = useToast();

  const {
    data: p,
    isLoading,
    error,
  } = useQuery({ queryKey: pmKeys.project(projectId), queryFn: () => fetchProject(projectId) });

  const { data: groups } = useQuery({
    queryKey: ['planner', 'groups'],
    queryFn: fetchPlannerGroups,
    enabled: canManage,
  });

  const [patch, setPatch] = useState<ProjectPatch>({});
  const [selectedGroupId, setSelectedGroupId] = useState('');

  useEffect(() => {
    setSelectedGroupId(p?.planner_group_id ?? '');
  }, [p?.planner_group_id]);

  // Org unit: seeded by the persisted id until the draft patch picks a different one — the
  // same hook backs both the read-only-when-locked display and the editing Typeahead.
  const effectiveOrgUnitId =
    patch.org_unit_id !== undefined ? patch.org_unit_id : (p?.org_unit_id ?? null);
  const [orgUnitItem, setOrgUnitItem] = useSeededItem(effectiveOrgUnitId, orgUnitSearch.seed);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: pmKeys.project(projectId) });
    void queryClient.invalidateQueries({ queryKey: pmKeys.projects() });
  }

  const save = useMutation({
    mutationFn: () => editProject(projectId, { expected_version: p?.version, patch }),
    onSuccess: () => {
      toast({ body: 'Project saved' });
      setPatch({});
      invalidate();
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  const close = useMutation({
    mutationFn: () => closeProject(projectId, p?.version),
    onSuccess: () => {
      toast({ body: 'Project closed' });
      invalidate();
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  const reopen = useMutation({
    mutationFn: () => reopenProject(projectId, p?.version),
    onSuccess: () => {
      toast({ body: 'Project reopened' });
      invalidate();
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  const link = useMutation({
    mutationFn: () => linkPlannerGroup(projectId, selectedGroupId || null, p?.version),
    onSuccess: () => {
      toast({ body: 'Planner board linked' });
      invalidate();
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  const createBoard = useMutation({
    mutationFn: async () => {
      const g = await createPlannerGroup(p?.name ?? 'Project board');
      return linkPlannerGroup(projectId, g.id, p?.version);
    },
    onSuccess: () => {
      toast({ body: 'Board created & linked' });
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['planner', 'groups'] });
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  const backLink = (
    <Link
      to="/pm/projects"
      className="flex items-center gap-1 text-body-sm text-ink-muted hover:text-ink transition-colors"
    >
      <ChevronLeft className="size-4" />
      Projects
    </Link>
  );

  if (isLoading) {
    return (
      <PageChrome title="Project" breadcrumb={[backLink]}>
        <div className="page-container p-6 space-y-4">
          <Card>
            <Layout
              header={
                <LayoutHeader hasDivider>
                  <Skeleton height={20} width={192} />
                </LayoutHeader>
              }
              content={
                <LayoutContent>
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional
                      <Skeleton key={i} height={16} />
                    ))}
                  </div>
                </LayoutContent>
              }
            />
          </Card>
        </div>
      </PageChrome>
    );
  }

  if (error || !p) {
    const msg = (error as Error | null)?.message ?? 'Project not found';
    return (
      <PageChrome title="Project" breadcrumb={[backLink]}>
        <div className="page-container p-6">
          <Banner status="error" title={msg} />
        </div>
      </PageChrome>
    );
  }

  const isClosed = p.status === 'closed';
  const inputsDisabled = !canManage || isClosed;

  function patchVal<K extends keyof ProjectPatch>(k: K, fallback: ProjectPatch[K]) {
    return (patch[k] ?? fallback) as ProjectPatch[K];
  }

  const actions = canManage ? (
    isClosed ? (
      <Button
        label={reopen.isPending ? 'Reopening…' : 'Reopen project'}
        onClick={() => reopen.mutate()}
        isDisabled={reopen.isPending}
      />
    ) : (
      <div className="flex gap-2">
        <Button
          variant="secondary"
          label={close.isPending ? 'Closing…' : 'Close project'}
          onClick={() => close.mutate()}
          isDisabled={close.isPending}
        />
        <Button
          label={save.isPending ? 'Saving…' : 'Save'}
          onClick={() => save.mutate()}
          isDisabled={save.isPending || Object.keys(patch).length === 0}
        />
      </div>
    )
  ) : undefined;

  return (
    <PageChrome title={p.name} breadcrumb={[backLink]} actions={actions}>
      <div className="page-container p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Badge variant="neutral" label={p.phase} />
          <Badge variant={STATUS_VARIANT[p.status]} label={p.status} />
        </div>

        <Card>
          <Layout
            header={
              <LayoutHeader hasDivider>
                <CardTitle>Details</CardTitle>
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Selector
                        label="Phase"
                        options={PHASES.map((ph) => ({ value: ph, label: ph }))}
                        value={patchVal('phase', p.phase) ?? undefined}
                        onChange={(v) => setPatch((s) => ({ ...s, phase: v }))}
                        isDisabled={inputsDisabled}
                      />
                    </div>
                    <div className="space-y-1">
                      <Selector
                        label="Status"
                        options={STATUSES.map((st) => ({ value: st, label: st }))}
                        value={patchVal('status', p.status) ?? undefined}
                        onChange={(v) =>
                          setPatch((s) => ({ ...s, status: v as ProjectPatch['status'] }))
                        }
                        isDisabled={inputsDisabled}
                      />
                    </div>
                  </div>

                  <Textarea
                    label="Objective"
                    value={(patchVal('objective', p.objective) ?? '') as string}
                    onChange={(value) => setPatch((s) => ({ ...s, objective: value }))}
                    isDisabled={inputsDisabled}
                  />

                  <div className="space-y-1">
                    <Typeahead
                      label="Org unit"
                      searchSource={orgUnitSearch.source}
                      value={orgUnitItem}
                      onChange={(item) => {
                        setOrgUnitItem(item);
                        setPatch((s) => ({ ...s, org_unit_id: item?.id ?? null }));
                      }}
                      placeholder="Search org units…"
                      isDisabled={inputsDisabled}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Textarea
                      label="Scope (in)"
                      value={patch.scope?.in ?? p.scope?.in ?? ''}
                      onChange={(value) =>
                        setPatch((s) => ({
                          ...s,
                          scope: { in: value, out: s.scope?.out ?? p.scope?.out ?? '' },
                        }))
                      }
                      isDisabled={inputsDisabled}
                    />
                    <Textarea
                      label="Scope (out)"
                      value={patch.scope?.out ?? p.scope?.out ?? ''}
                      onChange={(value) =>
                        setPatch((s) => ({
                          ...s,
                          scope: { in: s.scope?.in ?? p.scope?.in ?? '', out: value },
                        }))
                      }
                      isDisabled={inputsDisabled}
                    />
                  </div>
                </div>
              </LayoutContent>
            }
          />
        </Card>

        {canManage && (
          <Card>
            <Layout
              header={
                <LayoutHeader hasDivider>
                  <CardTitle>Planner board</CardTitle>
                </LayoutHeader>
              }
              content={
                <LayoutContent>
                  <div className="flex items-end gap-2">
                    <div className="space-y-1 flex-1">
                      <Selector
                        label="Board"
                        options={(groups ?? []).map((g) => ({ value: g.id, label: g.name }))}
                        value={selectedGroupId || undefined}
                        onChange={setSelectedGroupId}
                        placeholder="Select a board"
                      />
                    </div>
                    <Button
                      variant="secondary"
                      label="Link"
                      onClick={() => link.mutate()}
                      isDisabled={link.isPending || !selectedGroupId}
                    />
                    <Button
                      variant="secondary"
                      label={createBoard.isPending ? 'Creating…' : 'Create board'}
                      onClick={() => createBoard.mutate()}
                      isDisabled={createBoard.isPending}
                    />
                  </div>
                  {p.planner_group_id && (
                    <p className="mt-2 text-body-sm text-ink-muted">
                      Linked:{' '}
                      <span className="font-mono text-caption text-ink">{p.planner_group_id}</span>
                      {groups?.find((g) => g.id === p.planner_group_id) && (
                        <> — {groups.find((g) => g.id === p.planner_group_id)?.name}</>
                      )}
                    </p>
                  )}
                </LayoutContent>
              }
            />
          </Card>
        )}

        <Card className="space-y-6 pt-6">
          <StaffingPlanSection projectId={projectId} canManage={canManage} />
          <ProjectAccessSection projectId={projectId} canManage={canManage} />
        </Card>
      </div>
    </PageChrome>
  );
}
