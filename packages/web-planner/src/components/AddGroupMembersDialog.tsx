import type { GroupMemberRow } from '@seta/planner';
import {
  Avatar,
  Banner,
  Button,
  Checkbox,
  Dialog,
  DialogFooter,
  DialogHeader,
  IconButton,
  Input,
  Layout,
  LayoutContent,
  useToast,
} from '@seta/shared-ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PlannerClientError, plannerClient } from '../api/planner-client';
import { useAddGroupMembers } from '../hooks/mutations/add-group-members';
import { LINKED_GROUP } from '../lib/permission-messages';
import { plannerKeys } from '../state/query-keys';

interface Props {
  groupId: string;
  existingMembers: ReadonlyArray<GroupMemberRow>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Candidate = { user_id: string; display_name: string; email: string };

function addMembersErrorMessage(e: unknown): string {
  if (e instanceof PlannerClientError && e.code === 'LINKED_GROUP_IMMUTABLE_MEMBERS') {
    return LINKED_GROUP.members;
  }
  return e instanceof Error ? e.message : "Couldn't add members.";
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function AddGroupMembersDialog({ groupId, open, onOpenChange }: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const debouncedSearch = useDebounced(search, 200);
  const addMembers = useAddGroupMembers(groupId);
  const qc = useQueryClient();
  const toast = useToast();

  const candidatesQuery = useQuery({
    queryKey: plannerKeys.groupMemberCandidates(groupId, debouncedSearch),
    queryFn: () =>
      plannerClient.listGroupMemberCandidates({
        group_id: groupId,
        search: debouncedSearch || undefined,
        limit: 300,
      }),
    enabled: open,
  });

  function toggle(candidate: Candidate) {
    setSelected((prev) => {
      const exists = prev.some((s) => s.user_id === candidate.user_id);
      if (exists) return prev.filter((s) => s.user_id !== candidate.user_id);
      if (prev.length >= 50) return prev;
      return [...prev, candidate];
    });
  }

  function handleConfirm() {
    if (selected.length === 0 || addMembers.isPending) return;
    setError(null);
    addMembers.mutate(
      selected.map((s) => ({ user_id: s.user_id })),
      {
        onSuccess: (result) => {
          if (result.status === 202) {
            toast({ body: 'Adding members in the background — the list will update in a moment.' });
            setTimeout(() => {
              void qc.refetchQueries({ queryKey: plannerKeys.groupMembers(groupId) });
            }, 3000);
          }
          reset();
          onOpenChange(false);
        },
        onError: (e) => setError(addMembersErrorMessage(e)),
      },
    );
  }

  function reset() {
    setSearch('');
    setSelected([]);
    setError(null);
  }

  const candidates = candidatesQuery.data?.candidates ?? [];
  const confirmLabel =
    selected.length === 0
      ? 'Add members'
      : `Add ${selected.length} member${selected.length > 1 ? 's' : ''}`;

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  return (
    <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form">
      <Layout
        header={<DialogHeader title="Add members" onOpenChange={handleOpenChange} />}
        content={
          <LayoutContent>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((s) => (
                  <span
                    key={s.user_id}
                    className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs"
                  >
                    {s.display_name}
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => toggle(s)}
                      label={`Remove ${s.display_name}`}
                      icon={<X className="size-3" />}
                    />
                  </span>
                ))}
              </div>
            )}

            <Input
              label="Search by name or email"
              isLabelHidden
              placeholder="Search by name or email…"
              value={search}
              onChange={(value) => setSearch(value)}
              hasAutoFocus
            />

            <div className="max-h-[260px] overflow-y-auto divide-y divide-border rounded-md border border-border">
              {candidatesQuery.isPending && (
                <p className="py-4 text-center text-sm text-secondary">Searching…</p>
              )}
              {!candidatesQuery.isPending && candidates.length === 0 && (
                <p className="py-4 text-center text-sm text-secondary">
                  {debouncedSearch
                    ? 'No matching users.'
                    : 'All workspace members are already in this group.'}
                </p>
              )}
              {candidates.map((c) => {
                const isSelected = selected.some((s) => s.user_id === c.user_id);
                return (
                  <button
                    key={c.user_id}
                    type="button"
                    onClick={() => toggle(c)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-card text-left"
                  >
                    <Checkbox
                      label={`Select ${c.display_name}`}
                      isLabelHidden
                      value={isSelected}
                      isReadOnly
                    />
                    <Avatar name={c.display_name} size={32} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.display_name}</p>
                      <p className="text-xs text-secondary truncate">{c.email}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {error && <Banner status="error" role="alert" title={error} />}
          </LayoutContent>
        }
        footer={
          <DialogFooter>
            <Button
              variant="secondary"
              label="Cancel"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            />
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              label={confirmLabel}
              onClick={handleConfirm}
              isDisabled={selected.length === 0 || addMembers.isPending}
            />
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
