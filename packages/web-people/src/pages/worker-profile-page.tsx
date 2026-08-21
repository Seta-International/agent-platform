import {
  Avatar,
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Card,
  CardTitle,
  EmptyState,
  formatRelative,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageContainer,
  Skeleton,
  SkillLevelRating,
  Text,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { Clock } from 'lucide-react';
import {
  fetchWorker,
  fetchWorkerHistory,
  genderLabel,
  getWorkerCvDownloadUrl,
  type WorkerDetail,
} from '../api/people-client.ts';
import { peopleKeys } from '../state/query-keys.ts';

function LifecycleBadge({ stage }: { stage: string | null }) {
  const variantMap: Record<string, 'neutral' | 'error'> = {
    active: 'neutral',
    onboarding: 'neutral',
    offboarding: 'neutral',
    terminated: 'error',
    leave: 'neutral',
  };
  return (
    <Badge
      variant={(stage ? variantMap[stage] : undefined) ?? 'neutral'}
      className="capitalize"
      label={stage}
    />
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 items-start py-2 border-b border-border last:border-0">
      <span className="text-base text-secondary font-medium">{label}</span>
      <span className="text-base text-primary break-all">{value ?? '—'}</span>
    </div>
  );
}

export function WorkerProfilePage() {
  const params = useParams({ strict: false });
  const workerId = params.workerId as string;

  const {
    data: worker,
    isLoading: workerLoading,
    error: workerError,
  } = useQuery({
    queryKey: peopleKeys.worker(workerId),
    queryFn: () => fetchWorker(workerId),
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: peopleKeys.history(workerId),
    queryFn: () => fetchWorkerHistory(workerId),
  });

  if (workerLoading) {
    return (
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/people">People</BreadcrumbItem>
                <BreadcrumbItem href="/people/employees">Employees</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Profile</BreadcrumbItem>
              </Breadcrumbs>
              <HStack hAlign="between" vAlign="center" gap={2}>
                <HStack gap={2} vAlign="center">
                  <Text as="h1" size="lg" weight="semibold">
                    Profile
                  </Text>
                </HStack>
              </HStack>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <PageContainer className="space-y-4">
              <Card>
                <Layout
                  header={
                    <LayoutHeader hasDivider>
                      <div className="flex items-center gap-4">
                        <Skeleton height={56} width={56} radius="rounded" />
                        <div className="space-y-2">
                          <Skeleton height={20} width={160} />
                          <Skeleton height={16} width={96} />
                        </div>
                      </div>
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
            </PageContainer>
          </LayoutContent>
        }
      />
    );
  }

  if (workerError || !worker) {
    const msg = (workerError as Error | null)?.message ?? 'Worker not found';
    return (
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/people">People</BreadcrumbItem>
                <BreadcrumbItem href="/people/employees">Employees</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Profile</BreadcrumbItem>
              </Breadcrumbs>
              <HStack hAlign="between" vAlign="center" gap={2}>
                <HStack gap={2} vAlign="center">
                  <Text as="h1" size="lg" weight="semibold">
                    Profile
                  </Text>
                </HStack>
              </HStack>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <PageContainer>
              <Banner status="error" title={msg} />
            </PageContainer>
          </LayoutContent>
        }
      />
    );
  }

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/people">People</BreadcrumbItem>
              <BreadcrumbItem href="/people/employees">Employees</BreadcrumbItem>
              <BreadcrumbItem isCurrent>{worker.full_name}</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  {worker.full_name}
                </Text>
              </HStack>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <PageContainer className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
            <div className="space-y-6">
              {/* Profile card */}
              <Card>
                <Layout
                  header={
                    <LayoutHeader hasDivider>
                      <div className="flex items-center gap-4">
                        {/* Name is spelled out beside the avatar, so Astryx's
                            name-on-hover tooltip would only duplicate it. */}
                        <Avatar
                          name={worker.full_name}
                          src={worker.photo_url ?? undefined}
                          size={60}
                          tooltip={false}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-2xl font-semibold truncate">
                              {worker.full_name}
                            </span>
                            <LifecycleBadge stage={worker.lifecycle_stage} />
                          </div>
                          <p className="text-base text-secondary truncate">
                            {worker.work_email || '—'}
                          </p>
                        </div>
                      </div>
                    </LayoutHeader>
                  }
                  content={
                    <LayoutContent>
                      <div>
                        <FieldRow label="Full name" value={worker.full_name} />
                        <FieldRow label="Employee number" value={worker.employee_no} />
                        <FieldRow label="Job title" value={worker.job_title} />
                        <FieldRow label="Manager" value={worker.manager_name} />
                        <FieldRow label="Org unit" value={worker.org_unit_name} />
                        <FieldRow label="Work email" value={worker.work_email} />
                        <FieldRow label="Personal email" value={worker.personal_email} />
                        <FieldRow label="Phone" value={worker.phone} />
                        <FieldRow label="Date of birth" value={worker.dob} />
                        <FieldRow label="Gender" value={genderLabel(worker.gender)} />
                        <FieldRow label="Emergency contact" value={worker.emergency_contact} />
                        <FieldRow
                          label="Lifecycle stage"
                          value={<LifecycleBadge stage={worker.lifecycle_stage} />}
                        />
                        <FieldRow label="CV" value={<WorkerCvActions worker={worker} />} />
                      </div>
                    </LayoutContent>
                  }
                />
              </Card>

              {/* Techstack card */}
              <Card>
                <Layout
                  header={
                    <LayoutHeader hasDivider>
                      <CardTitle>Techstack</CardTitle>
                    </LayoutHeader>
                  }
                  content={
                    <LayoutContent>
                      {worker.skills.length === 0 ? (
                        <span className="text-base text-secondary">—</span>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                          {worker.skills.map((s) => (
                            <div
                              key={s.id}
                              className="group flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-base font-medium text-primary truncate">
                                  {s.name}
                                </span>
                                <span className="shrink-0 text-sm tabular-nums text-secondary">
                                  {s.level ? `${s.level}/5` : '—'}
                                </span>
                              </div>
                              <SkillLevelRating level={s.level} />
                            </div>
                          ))}
                        </div>
                      )}
                    </LayoutContent>
                  }
                />
              </Card>

              {/* Engagements card */}
              <Card>
                <Layout
                  header={
                    <LayoutHeader hasDivider>
                      <CardTitle>Engagements</CardTitle>
                    </LayoutHeader>
                  }
                  content={
                    <LayoutContent>
                      {worker.accounts.length === 0 ? (
                        <span className="text-base text-secondary">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {worker.accounts.map((a) => (
                            <Badge key={a.id} variant="neutral" label={a.name} />
                          ))}
                        </div>
                      )}
                    </LayoutContent>
                  }
                />
              </Card>
            </div>

            {/* Change history card */}
            <div>
              <Card>
                <Layout
                  header={
                    <LayoutHeader hasDivider>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="size-4 text-secondary" />
                        Change history
                      </CardTitle>
                    </LayoutHeader>
                  }
                  content={
                    <LayoutContent>
                      {historyLoading ? (
                        <div className="space-y-3">
                          {Array.from({ length: 3 }).map((_, i) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional
                            <Skeleton key={i} height={40} />
                          ))}
                        </div>
                      ) : !history || history.length === 0 ? (
                        <EmptyState title="No changes yet" description="Edits will appear here." />
                      ) : (
                        <ul className="space-y-3">
                          {history.map((entry, i) => (
                            <li
                              // biome-ignore lint/suspicious/noArrayIndexKey: history entries have no stable client-side key
                              key={i}
                              className="border-b border-border pb-3 last:border-0 last:pb-0"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-base font-medium text-primary capitalize">
                                    {entry.action}
                                  </p>
                                  <p className="text-base text-secondary truncate">
                                    <span className="font-mono">{entry.field}</span>
                                    {': '}
                                    <span className="line-through opacity-60">
                                      {entry.from_val ?? '—'}
                                    </span>
                                    {' → '}
                                    <span>{entry.to_val ?? '—'}</span>
                                  </p>
                                  <p className="text-xs text-disabled mt-0.5">
                                    by {entry.by_user_id}
                                  </p>
                                </div>
                                <span className="flex-none text-xs text-disabled whitespace-nowrap">
                                  {formatRelative(entry.at)}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </LayoutContent>
                  }
                />
              </Card>
            </div>
          </PageContainer>
        </LayoutContent>
      }
    />
  );
}

function WorkerCvActions({ worker }: { worker: WorkerDetail }) {
  const toast = useToast();

  const download = useMutation({
    mutationFn: () => getWorkerCvDownloadUrl(worker.worker_id),
    onSuccess: (url) => window.open(url, '_blank', 'noopener'),
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  if (!worker.cv_storage_key) {
    return <span className="text-secondary">—</span>;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      label="Download"
      isDisabled={download.isPending}
      onClick={() => download.mutate()}
      className="h-auto p-0"
    />
  );
}
