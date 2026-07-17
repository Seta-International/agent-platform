import {
  Badge,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Input,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageContainer,
  Skeleton,
  Text,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { createJoinRequest, discoverGroups } from '../api/planner-client';

export function GroupDiscoverPage() {
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const toast = useToast();

  const searchQuery = useQuery({
    queryKey: ['planner', 'groups', 'discover', submittedQ],
    queryFn: () => discoverGroups(submittedQ),
    enabled: submittedQ.length > 0,
  });

  const joinMutation = useMutation({
    mutationFn: (groupId: string) => createJoinRequest(groupId),
    onSuccess: (_data, groupId) => {
      setRequestedIds((prev) => new Set(prev).add(groupId));
      toast({ body: 'Request sent' });
    },
    onError: (err) => {
      toast({
        body: err instanceof Error ? err.message : "Couldn't send the join request.",
        type: 'error',
      });
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedQ(q.trim());
  }

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/planner">Planner</BreadcrumbItem>
              <BreadcrumbItem href="/planner/groups">Groups</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Find a Workspace Group</BreadcrumbItem>
            </Breadcrumbs>
            <Text as="h1" size="lg" weight="semibold">
              Find a Workspace Group
            </Text>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <PageContainer>
            <form onSubmit={handleSearch} className="flex gap-2 mb-8">
              <Input
                label="Search by group name"
                isLabelHidden
                placeholder="Search by group name…"
                value={q}
                onChange={(value) => setQ(value)}
                className="flex-1"
              />
              <Button
                type="submit"
                icon={<Search className="size-4" />}
                label="Search"
                isDisabled={q.trim().length === 0}
              />
            </form>

            {searchQuery.isPending && submittedQ && (
              <div className="flex flex-col gap-3">
                {(['sk-0', 'sk-1', 'sk-2'] as const).map((k) => (
                  <Skeleton key={k} height={80} radius={3} />
                ))}
              </div>
            )}

            {searchQuery.data && searchQuery.data.length === 0 && (
              <p className="text-sm text-secondary">
                No public groups match &ldquo;{submittedQ}&rdquo;.
              </p>
            )}

            {searchQuery.data && searchQuery.data.length > 0 && (
              <ul className="flex flex-col gap-3">
                {searchQuery.data.map((group) => {
                  const isRequested = group.has_pending_request || requestedIds.has(group.id);
                  return (
                    <li
                      key={group.id}
                      className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{group.name}</p>
                        {group.description && (
                          <p className="text-sm text-secondary mt-1 truncate">
                            {group.description}
                          </p>
                        )}
                        <p className="text-xs text-secondary mt-1">
                          {group.member_count} member
                          {group.member_count !== 1 ? 's' : ''}
                          {group.owner_display_name ? ` · Owner: ${group.owner_display_name}` : ''}
                        </p>
                      </div>
                      {group.is_member ? (
                        <Badge variant="success" className="shrink-0" label="Member" />
                      ) : (
                        <Button
                          size="sm"
                          variant={isRequested ? 'secondary' : 'primary'}
                          isDisabled={isRequested || joinMutation.isPending}
                          onClick={() => joinMutation.mutate(group.id)}
                          label={isRequested ? 'Requested' : 'Request to Join'}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </PageContainer>
        </LayoutContent>
      }
    />
  );
}
