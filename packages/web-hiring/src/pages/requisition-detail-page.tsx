import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageChrome,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import {
  closeRequisition,
  editRequisition,
  holdRequisition,
  type RequisitionPatch,
  resumeRequisition,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { JdTab } from './jd-tab.tsx';
import { OpeningsTab } from './openings-tab.tsx';
import { SkillsTab } from './skills-tab.tsx';
import { on409, useRequisition } from './utils.ts';

export function RequisitionDetailPage({ requisitionId }: { requisitionId: string }) {
  const queryClient = useQueryClient();
  const canManage = usePermission('hiring.requisition.manage');
  const canClose = usePermission('hiring.requisition.close');
  const { data, isLoading, error } = useRequisition(requisitionId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RequisitionPatch>({});

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: hiringKeys.requisition(requisitionId) });
    void queryClient.invalidateQueries({ queryKey: hiringKeys.requisitions() });
  };

  const save = useMutation({
    mutationFn: () =>
      editRequisition(requisitionId, { expected_version: data?.requisition.version, patch: draft }),
    onSuccess: () => {
      toast.success('Saved');
      setEditing(false);
      setDraft({});
      refresh();
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.requisition(requisitionId)),
  });
  const lifecycle = useMutation({
    mutationFn: (action: 'hold' | 'resume' | 'fill' | 'cancel') => {
      const v = data?.requisition.version;
      if (action === 'hold') return holdRequisition(requisitionId, { expected_version: v });
      if (action === 'resume') return resumeRequisition(requisitionId, { expected_version: v });
      return closeRequisition(requisitionId, {
        expected_version: v,
        status: action === 'fill' ? 'filled' : 'cancelled',
      });
    },
    onSuccess: () => {
      toast.success('Requisition updated');
      refresh();
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.requisition(requisitionId)),
  });

  const breadcrumb = [
    <Link key="reqs" to="/hiring/requisitions">
      Requisitions
    </Link>,
  ];

  if (isLoading)
    return (
      <PageChrome title="Requisition" breadcrumb={breadcrumb}>
        <div className="p-6 text-ink-muted">Loading…</div>
      </PageChrome>
    );
  if (error || !data)
    return (
      <PageChrome title="Requisition" breadcrumb={breadcrumb}>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertDescription>{(error as Error)?.message ?? 'Not found'}</AlertDescription>
          </Alert>
        </div>
      </PageChrome>
    );

  const req = data.requisition;
  const terminal = req.status === 'filled' || req.status === 'cancelled';
  const headerActions =
    canManage && !terminal ? (
      <div className="flex gap-2">
        {req.status === 'open' && (
          <Button size="sm" variant="secondary" onClick={() => lifecycle.mutate('hold')}>
            Hold
          </Button>
        )}
        {req.status === 'on_hold' && (
          <Button size="sm" variant="secondary" onClick={() => lifecycle.mutate('resume')}>
            Resume
          </Button>
        )}
        {canClose && (
          <Button size="sm" variant="secondary" onClick={() => lifecycle.mutate('fill')}>
            Mark filled
          </Button>
        )}
        {canClose && (
          <Button size="sm" variant="destructive" onClick={() => lifecycle.mutate('cancel')}>
            Cancel
          </Button>
        )}
      </div>
    ) : undefined;

  return (
    <PageChrome title={req.title} breadcrumb={breadcrumb} actions={headerActions}>
      <div className="page-container p-6">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="jd">Job description</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="openings">Openings</TabsTrigger>
            <TabsTrigger value="applicants">Applicants</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{req.title}</CardTitle>
                {canManage && !terminal && !editing && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDraft({
                        title: req.title,
                        role_title: req.role_title ?? '',
                        grade: req.grade ?? '',
                        kind: req.kind as 'new' | 'replacement',
                        due_date: req.due_date ?? '',
                        start_date: req.start_date ?? '',
                        note: req.note ?? '',
                      });
                      setEditing(true);
                    }}
                  >
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {editing ? (
                  <>
                    <Field label="Title">
                      <Input
                        value={draft.title ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      />
                    </Field>
                    <Field label="Role title">
                      <Input
                        value={draft.role_title ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, role_title: e.target.value }))}
                      />
                    </Field>
                    <Field label="Grade">
                      <Input
                        value={draft.grade ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, grade: e.target.value }))}
                      />
                    </Field>
                    <Field label="Start date">
                      <Input
                        type="date"
                        value={draft.start_date ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
                      />
                    </Field>
                    <Field label="Due date">
                      <Input
                        type="date"
                        value={draft.due_date ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))}
                      />
                    </Field>
                    <Field label="Note">
                      <Input
                        value={draft.note ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                      />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditing(false);
                          setDraft({});
                        }}
                      >
                        Cancel
                      </Button>
                      <Button onClick={() => save.mutate()} disabled={save.isPending}>
                        {save.isPending ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <ReadRow label="Role title" value={req.role_title} />
                    <ReadRow label="Grade" value={req.grade} />
                    <ReadRow label="Account" value={data.account_name} />
                    <ReadRow label="Project" value={data.project_name} />
                    <ReadRow label="Type" value={req.kind} />
                    <ReadRow label="Status" value={req.status} />
                    <ReadRow label="Stage" value={req.stage} />
                    <ReadRow label="Start" value={req.start_date} />
                    <ReadRow label="Due" value={req.due_date} />
                    <ReadRow label="Interview mode" value={req.default_interview_mode} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jd">
            <JdTab detail={data} canManage={canManage && !terminal} />
          </TabsContent>
          <TabsContent value="skills">
            <SkillsTab detail={data} canManage={canManage && !terminal} />
          </TabsContent>
          <TabsContent value="openings">
            <OpeningsTab detail={data} canManage={canManage && !terminal} />
          </TabsContent>
          <TabsContent value="applicants">
            {data.applicants.length === 0 ? (
              <div className="p-4 text-ink-muted">No internal applicants yet.</div>
            ) : (
              <div className="divide-y divide-hairline">
                {data.applicants.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2">
                    <span className="text-ink">
                      {a.kind === 'internal' ? a.worker_id : a.candidate_id}
                    </span>
                    <span className="text-caption text-ink-muted">
                      {a.stage ?? a.status ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageChrome>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ReadRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between border-b border-hairline py-1.5">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink">{value ?? '—'}</span>
    </div>
  );
}
