import {
  AsyncCombobox,
  Badge,
  Banner,
  Button,
  Card,
  CardTitle,
  Label,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageChrome,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  toast,
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

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: pmKeys.project(projectId) });
    void queryClient.invalidateQueries({ queryKey: pmKeys.projects() });
  }

  const save = useMutation({
    mutationFn: () => editProject(projectId, { expected_version: p?.version, patch }),
    onSuccess: () => {
      toast.success('Project saved');
      setPatch({});
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = useMutation({
    mutationFn: () => closeProject(projectId, p?.version),
    onSuccess: () => {
      toast.success('Project closed');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reopen = useMutation({
    mutationFn: () => reopenProject(projectId, p?.version),
    onSuccess: () => {
      toast.success('Project reopened');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const link = useMutation({
    mutationFn: () => linkPlannerGroup(projectId, selectedGroupId || null, p?.version),
    onSuccess: () => {
      toast.success('Planner board linked');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createBoard = useMutation({
    mutationFn: async () => {
      const g = await createPlannerGroup(p?.name ?? 'Project board');
      return linkPlannerGroup(projectId, g.id, p?.version);
    },
    onSuccess: () => {
      toast.success('Board created & linked');
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['planner', 'groups'] });
    },
    onError: (e: Error) => toast.error(e.message),
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
                      <Label>Phase</Label>
                      <Select
                        value={patchVal('phase', p.phase) ?? ''}
                        onValueChange={(v) => setPatch((s) => ({ ...s, phase: v }))}
                        disabled={inputsDisabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PHASES.map((ph) => (
                            <SelectItem key={ph} value={ph}>
                              {ph}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select
                        value={patchVal('status', p.status) ?? ''}
                        onValueChange={(v) =>
                          setPatch((s) => ({ ...s, status: v as ProjectPatch['status'] }))
                        }
                        disabled={inputsDisabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((st) => (
                            <SelectItem key={st} value={st}>
                              {st}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Textarea
                    label="Objective"
                    value={(patchVal('objective', p.objective) ?? '') as string}
                    onChange={(value) => setPatch((s) => ({ ...s, objective: value }))}
                    isDisabled={inputsDisabled}
                  />

                  <div className="space-y-1">
                    <Label>Org unit</Label>
                    <AsyncCombobox
                      value={patch.org_unit_id !== undefined ? patch.org_unit_id : p.org_unit_id}
                      onChange={(v) => setPatch((s) => ({ ...s, org_unit_id: v }))}
                      search={orgUnitSearch.search}
                      resolveByIds={orgUnitSearch.resolveByIds}
                      placeholder="Search org units…"
                      disabled={inputsDisabled}
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
                      <Label>Board</Label>
                      <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a board" />
                        </SelectTrigger>
                        <SelectContent>
                          {(groups ?? []).map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
