import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
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

const STATUS_VARIANT: Record<
  ProjectDetail['status'],
  'secondary' | 'success' | 'destructive' | 'outline'
> = {
  active: 'success',
  on_hold: 'secondary',
  closed: 'outline',
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
            <CardHeader>
              <Skeleton className="h-5 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </CardContent>
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
          <Alert variant="destructive">
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
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
      <Button onClick={() => reopen.mutate()} disabled={reopen.isPending}>
        {reopen.isPending ? 'Reopening…' : 'Reopen project'}
      </Button>
    ) : (
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => close.mutate()} disabled={close.isPending}>
          {close.isPending ? 'Closing…' : 'Close project'}
        </Button>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || Object.keys(patch).length === 0}
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    )
  ) : undefined;

  return (
    <PageChrome title={p.name} breadcrumb={[backLink]} actions={actions}>
      <div className="page-container p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{p.phase}</Badge>
          <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="space-y-1">
              <Label>Objective</Label>
              <Textarea
                value={(patchVal('objective', p.objective) ?? '') as string}
                onChange={(e) => setPatch((s) => ({ ...s, objective: e.target.value }))}
                disabled={inputsDisabled}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Scope (in)</Label>
                <Textarea
                  value={patch.scope?.in ?? p.scope?.in ?? ''}
                  onChange={(e) =>
                    setPatch((s) => ({
                      ...s,
                      scope: { in: e.target.value, out: s.scope?.out ?? p.scope?.out ?? '' },
                    }))
                  }
                  disabled={inputsDisabled}
                />
              </div>
              <div className="space-y-1">
                <Label>Scope (out)</Label>
                <Textarea
                  value={patch.scope?.out ?? p.scope?.out ?? ''}
                  onChange={(e) =>
                    setPatch((s) => ({
                      ...s,
                      scope: { in: s.scope?.in ?? p.scope?.in ?? '', out: e.target.value },
                    }))
                  }
                  disabled={inputsDisabled}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle>Planner board</CardTitle>
            </CardHeader>
            <CardContent>
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
                  onClick={() => link.mutate()}
                  disabled={link.isPending || !selectedGroupId}
                >
                  Link
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => createBoard.mutate()}
                  disabled={createBoard.isPending}
                >
                  {createBoard.isPending ? 'Creating…' : 'Create board'}
                </Button>
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
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-6 pt-6">
            <StaffingPlanSection projectId={projectId} canManage={canManage} />
            <ProjectAccessSection projectId={projectId} canManage={canManage} />
          </CardContent>
        </Card>
      </div>
    </PageChrome>
  );
}
