import {
  Badge,
  Banner,
  Button,
  Card,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageChrome,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
  archiveCloseReason,
  archiveRejectionReason,
  createCloseReason,
  createJdTemplate,
  createRejectionReason,
  deleteJdTemplate,
  fetchCloseReasons,
  fetchJdTemplates,
  fetchRejectionReasons,
  type JdSectionKey,
  type JdVariant,
  type RejectionCategory,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { on409 } from './utils.ts';

const SECTIONS: { key: JdSectionKey; label: string }[] = [
  { key: 'about', label: 'About the role' },
  { key: 'responsibilities', label: 'Responsibilities' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'nice_to_have', label: 'Nice to have' },
];

function NewTemplateDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'role' | 'intro' | 'closing'>('role');
  const [variant, setVariant] = useState<JdVariant>('external');
  const [jd, setJd] = useState<Record<JdSectionKey, string>>({
    about: '',
    responsibilities: '',
    requirements: '',
    nice_to_have: '',
  });
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setKind('role');
    setVariant('external');
    setJd({ about: '', responsibilities: '', requirements: '', nice_to_have: '' });
    setError(null);
  }

  // Radix only fires onOpenChange for its own dismissals (Esc, overlay); closing
  // programmatically must reset explicitly or the next open shows stale data.
  function close() {
    setOpen(false);
    reset();
  }

  const mutation = useMutation({
    mutationFn: () =>
      createJdTemplate({
        name,
        kind,
        sections: SECTIONS.filter((s) => jd[s.key].trim()).map((s) => ({
          variant,
          section: s.key,
          body: jd[s.key],
        })),
      }),
    onSuccess: () => {
      toast.success('Template created');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.jdTemplates() });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" label="New template" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New JD template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Backend role"
            />
          </div>
          <div className="space-y-1">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as 'role' | 'intro' | 'closing')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="role">role</SelectItem>
                <SelectItem value="intro">intro</SelectItem>
                <SelectItem value="closing">closing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="text-caption font-semibold uppercase text-ink-muted">Sections</div>
            <SegmentedControl
              value={variant}
              onValueChange={(v) => setVariant(v as JdVariant)}
              options={[
                { value: 'external', label: 'External' },
                { value: 'internal', label: 'Internal' },
              ]}
            />
          </div>
          {SECTIONS.map((s) => (
            <Textarea
              key={s.key}
              label={s.label}
              value={jd[s.key]}
              onChange={(value) => setJd((d) => ({ ...d, [s.key]: value }))}
            />
          ))}
          {error && <Banner status="error" title={error} />}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" label="Cancel" onClick={close} />
            <Button
              label={mutation.isPending ? 'Creating…' : 'Create template'}
              onClick={() => mutation.mutate()}
              isDisabled={mutation.isPending || !name.trim()}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewCloseReasonDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLabel('');
    setError(null);
  }

  // Radix only fires onOpenChange for its own dismissals (Esc, overlay); closing
  // programmatically must reset explicitly or the next open shows stale data.
  function close() {
    setOpen(false);
    reset();
  }

  const mutation = useMutation({
    mutationFn: () => createCloseReason({ label }),
    onSuccess: () => {
      toast.success('Close reason created');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.closeReasons() });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" label="New close reason" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New close reason</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Label *</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Position cancelled"
            />
          </div>
          {error && <Banner status="error" title={error} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" label="Cancel" onClick={close} />
            <Button
              label={mutation.isPending ? 'Creating…' : 'Create'}
              onClick={() => mutation.mutate()}
              isDisabled={mutation.isPending || !label.trim()}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const REJECTION_CATEGORIES: { value: RejectionCategory; label: string }[] = [
  { value: 'rejected_by_us', label: 'We rejected them' },
  { value: 'withdrew', label: 'Candidate withdrew' },
  { value: 'other', label: 'Other' },
];

function NewRejectionReasonDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<RejectionCategory>('rejected_by_us');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLabel('');
    setCategory('rejected_by_us');
    setError(null);
  }

  // Radix only fires onOpenChange for its own dismissals (Esc, overlay); closing
  // programmatically must reset explicitly or the next open shows stale data.
  function close() {
    setOpen(false);
    reset();
  }

  const mutation = useMutation({
    mutationFn: () => createRejectionReason({ label, category }),
    onSuccess: () => {
      toast.success('Rejection reason created');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.rejectionReasons() });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" label="New rejection reason" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New rejection reason</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Label *</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Lacking required skills"
            />
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as RejectionCategory)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <Banner status="error" title={error} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" label="Cancel" onClick={close} />
            <Button
              label={mutation.isPending ? 'Creating…' : 'Create'}
              onClick={() => mutation.mutate()}
              isDisabled={mutation.isPending || !label.trim()}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission('hiring.jd_template.manage');
  const templates = useQuery({ queryKey: hiringKeys.jdTemplates(), queryFn: fetchJdTemplates });
  const reasons = useQuery({ queryKey: hiringKeys.closeReasons(), queryFn: fetchCloseReasons });

  const del = useMutation({
    mutationFn: (id: string) => deleteJdTemplate(id),
    onSuccess: () => {
      toast.success('Template deleted');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.jdTemplates() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const archive = useMutation({
    mutationFn: (vars: { id: string; version: number }) =>
      archiveCloseReason(vars.id, { expected_version: vars.version }),
    onSuccess: () => {
      toast.success('Close reason archived');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.closeReasons() });
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.closeReasons()),
  });

  const canManageRejections = usePermission('hiring.rejection_reason.manage');
  const rejections = useQuery({
    queryKey: hiringKeys.rejectionReasons(),
    queryFn: fetchRejectionReasons,
  });
  const archiveRejection = useMutation({
    mutationFn: (vars: { id: string; version: number }) =>
      archiveRejectionReason(vars.id, { expected_version: vars.version }),
    onSuccess: () => {
      toast.success('Rejection reason archived');
      void queryClient.invalidateQueries({ queryKey: hiringKeys.rejectionReasons() });
    },
    onError: (e: Error) => on409(e, queryClient, hiringKeys.rejectionReasons()),
  });

  return (
    <PageChrome
      title="Hiring settings"
      breadcrumb={[
        <Link key="reqs" to="/hiring/requisitions">
          Requisitions
        </Link>,
      ]}
    >
      <div className="page-container grid grid-cols-1 gap-6 p-6 xl:grid-cols-2">
        <Card>
          <Layout
            header={
              <LayoutHeader hasDivider className="flex flex-row items-center justify-between">
                <CardTitle>JD templates</CardTitle>
                {canManage && <NewTemplateDialog />}
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                {templates.error ? (
                  <Banner status="error" title={(templates.error as Error).message} />
                ) : templates.isLoading ? (
                  <div className="text-ink-muted">Loading…</div>
                ) : (templates.data?.length ?? 0) === 0 ? (
                  <div className="text-ink-muted">No templates yet.</div>
                ) : (
                  <div className="divide-y divide-hairline">
                    {templates.data?.map((t) => (
                      <div key={t.template.id} className="flex items-center justify-between py-2">
                        <span className="text-ink">
                          {t.template.name} <Badge variant="neutral" label={t.template.kind} />
                        </span>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            label="Delete"
                            onClick={() => del.mutate(t.template.id)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </LayoutContent>
            }
          />
        </Card>

        <Card>
          <Layout
            header={
              <LayoutHeader hasDivider className="flex flex-row items-center justify-between">
                <CardTitle>Close reasons</CardTitle>
                {canManage && <NewCloseReasonDialog />}
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                {reasons.error ? (
                  <Banner status="error" title={(reasons.error as Error).message} />
                ) : reasons.isLoading ? (
                  <div className="text-ink-muted">Loading…</div>
                ) : (reasons.data?.length ?? 0) === 0 ? (
                  <div className="text-ink-muted">No close reasons yet.</div>
                ) : (
                  <div className="divide-y divide-hairline">
                    {reasons.data?.map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-2">
                        <span className="text-ink">
                          {r.label} {!r.active && <Badge variant="neutral" label="archived" />}
                        </span>
                        {canManage && r.active && (
                          <Button
                            size="sm"
                            variant="ghost"
                            label="Archive"
                            onClick={() => archive.mutate({ id: r.id, version: r.version })}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </LayoutContent>
            }
          />
        </Card>

        <Card>
          <Layout
            header={
              <LayoutHeader hasDivider className="flex flex-row items-center justify-between">
                <CardTitle>Candidate rejection-reasons</CardTitle>
                {canManageRejections && <NewRejectionReasonDialog />}
              </LayoutHeader>
            }
            content={
              <LayoutContent>
                {rejections.error ? (
                  <Banner status="error" title={(rejections.error as Error).message} />
                ) : rejections.isLoading ? (
                  <div className="text-ink-muted">Loading…</div>
                ) : (rejections.data?.length ?? 0) === 0 ? (
                  <div className="text-ink-muted">No rejection reasons yet.</div>
                ) : (
                  <div className="divide-y divide-hairline">
                    {rejections.data?.map((r) => (
                      <div key={r.id} className="flex items-center justify-between py-2">
                        <span className="text-ink">
                          {r.label} <Badge variant="neutral" label={r.category} />
                          {!r.active && <Badge variant="neutral" label="archived" />}
                        </span>
                        {canManageRejections && r.active && (
                          <Button
                            size="sm"
                            variant="ghost"
                            label="Archive"
                            onClick={() =>
                              archiveRejection.mutate({ id: r.id, version: r.version })
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </LayoutContent>
            }
          />
        </Card>
      </div>
    </PageChrome>
  );
}
