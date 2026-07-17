import {
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Card,
  CardTitle,
  Dialog,
  DialogFooter,
  DialogHeader,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageContainer,
  SegmentedControl,
  SegmentedControlItem,
  Selector,
  Text,
  Textarea,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
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
  const toast = useToast();
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

  // Programmatic close must reset explicitly or the next open shows stale data.
  function close() {
    setOpen(false);
    reset();
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
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
      toast({ body: 'Template created' });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.jdTemplates() });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        icon={<Plus className="size-3.5" />}
        label="New template"
        onClick={() => setOpen(true)}
      />
      <Dialog
        isOpen={open}
        onOpenChange={handleOpenChange}
        width={560}
        maxHeight="70vh"
        purpose="form"
      >
        <Layout
          header={<DialogHeader title="New JD template" onOpenChange={handleOpenChange} />}
          content={
            <LayoutContent>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Input
                    label="Name"
                    isRequired
                    value={name}
                    onChange={(value) => setName(value)}
                    placeholder="e.g. Backend role"
                  />
                </div>
                <div className="space-y-1">
                  <Selector
                    label="Kind"
                    options={[
                      { value: 'role', label: 'role' },
                      { value: 'intro', label: 'intro' },
                      { value: 'closing', label: 'closing' },
                    ]}
                    value={kind}
                    onChange={(v) => setKind(v as 'role' | 'intro' | 'closing')}
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="text-sm font-semibold uppercase text-secondary">Sections</div>
                  <SegmentedControl
                    label="JD variant"
                    value={variant}
                    onChange={(v) => setVariant(v as JdVariant)}
                  >
                    <SegmentedControlItem value="external" label="External" />
                    <SegmentedControlItem value="internal" label="Internal" />
                  </SegmentedControl>
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
              </div>
            </LayoutContent>
          }
          footer={
            <DialogFooter>
              <Button variant="secondary" label="Cancel" onClick={close} />
              <Button
                variant="primary"
                icon={<Plus className="size-4" />}
                label={mutation.isPending ? 'Creating…' : 'Create template'}
                onClick={() => mutation.mutate()}
                isDisabled={mutation.isPending || !name.trim()}
              />
            </DialogFooter>
          }
        />
      </Dialog>
    </>
  );
}

function NewCloseReasonDialog() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLabel('');
    setError(null);
  }

  // Programmatic close must reset explicitly or the next open shows stale data.
  function close() {
    setOpen(false);
    reset();
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  const mutation = useMutation({
    mutationFn: () => createCloseReason({ label }),
    onSuccess: () => {
      toast({ body: 'Close reason created' });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.closeReasons() });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        icon={<Plus className="size-3.5" />}
        label="New close reason"
        onClick={() => setOpen(true)}
      />
      <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form">
        <Layout
          header={<DialogHeader title="New close reason" onOpenChange={handleOpenChange} />}
          content={
            <LayoutContent>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Input
                    label="Label"
                    isRequired
                    value={label}
                    onChange={(value) => setLabel(value)}
                    placeholder="e.g. Position cancelled"
                  />
                </div>
                {error && <Banner status="error" title={error} />}
              </div>
            </LayoutContent>
          }
          footer={
            <DialogFooter>
              <Button variant="secondary" label="Cancel" onClick={close} />
              <Button
                variant="primary"
                icon={<Plus className="size-4" />}
                label={mutation.isPending ? 'Creating…' : 'Create close reason'}
                onClick={() => mutation.mutate()}
                isDisabled={mutation.isPending || !label.trim()}
              />
            </DialogFooter>
          }
        />
      </Dialog>
    </>
  );
}

const REJECTION_CATEGORIES: { value: RejectionCategory; label: string }[] = [
  { value: 'rejected_by_us', label: 'We rejected them' },
  { value: 'withdrew', label: 'Candidate withdrew' },
  { value: 'other', label: 'Other' },
];

function NewRejectionReasonDialog() {
  const toast = useToast();
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

  // Programmatic close must reset explicitly or the next open shows stale data.
  function close() {
    setOpen(false);
    reset();
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  const mutation = useMutation({
    mutationFn: () => createRejectionReason({ label, category }),
    onSuccess: () => {
      toast({ body: 'Rejection reason created' });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.rejectionReasons() });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        icon={<Plus className="size-3.5" />}
        label="New rejection reason"
        onClick={() => setOpen(true)}
      />
      <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form">
        <Layout
          header={<DialogHeader title="New rejection reason" onOpenChange={handleOpenChange} />}
          content={
            <LayoutContent>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Input
                    label="Label"
                    isRequired
                    value={label}
                    onChange={(value) => setLabel(value)}
                    placeholder="e.g. Lacking required skills"
                  />
                </div>
                <div className="space-y-1">
                  <Selector
                    label="Category"
                    options={REJECTION_CATEGORIES}
                    value={category}
                    onChange={(v) => setCategory(v as RejectionCategory)}
                  />
                </div>
                {error && <Banner status="error" title={error} />}
              </div>
            </LayoutContent>
          }
          footer={
            <DialogFooter>
              <Button variant="secondary" label="Cancel" onClick={close} />
              <Button
                variant="primary"
                icon={<Plus className="size-4" />}
                label={mutation.isPending ? 'Creating…' : 'Create rejection reason'}
                onClick={() => mutation.mutate()}
                isDisabled={mutation.isPending || !label.trim()}
              />
            </DialogFooter>
          }
        />
      </Dialog>
    </>
  );
}

export function SettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = usePermission('hiring.jd_template.manage');
  const templates = useQuery({ queryKey: hiringKeys.jdTemplates(), queryFn: fetchJdTemplates });
  const reasons = useQuery({ queryKey: hiringKeys.closeReasons(), queryFn: fetchCloseReasons });

  const del = useMutation({
    mutationFn: (id: string) => deleteJdTemplate(id),
    onSuccess: () => {
      toast({ body: 'Template deleted' });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.jdTemplates() });
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });
  const archive = useMutation({
    mutationFn: (vars: { id: string; version: number }) =>
      archiveCloseReason(vars.id, { expected_version: vars.version }),
    onSuccess: () => {
      toast({ body: 'Close reason archived' });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.closeReasons() });
    },
    onError: (e: Error) => on409(toast, e, queryClient, hiringKeys.closeReasons()),
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
      toast({ body: 'Rejection reason archived' });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.rejectionReasons() });
    },
    onError: (e: Error) => on409(toast, e, queryClient, hiringKeys.rejectionReasons()),
  });

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/hiring">Hiring Management</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Hiring settings</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Hiring settings
                </Text>
              </HStack>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <PageContainer className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
                      <div className="text-secondary">Loading…</div>
                    ) : (templates.data?.length ?? 0) === 0 ? (
                      <div className="text-secondary">No templates yet.</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {templates.data?.map((t) => (
                          <div
                            key={t.template.id}
                            className="flex items-center justify-between py-2"
                          >
                            <span className="text-primary">
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
                      <div className="text-secondary">Loading…</div>
                    ) : (reasons.data?.length ?? 0) === 0 ? (
                      <div className="text-secondary">No close reasons yet.</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {reasons.data?.map((r) => (
                          <div key={r.id} className="flex items-center justify-between py-2">
                            <span className="text-primary">
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
                      <div className="text-secondary">Loading…</div>
                    ) : (rejections.data?.length ?? 0) === 0 ? (
                      <div className="text-secondary">No rejection reasons yet.</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {rejections.data?.map((r) => (
                          <div key={r.id} className="flex items-center justify-between py-2">
                            <span className="text-primary">
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
          </PageContainer>
        </LayoutContent>
      }
    />
  );
}
