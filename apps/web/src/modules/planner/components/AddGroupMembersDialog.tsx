import type { GroupMemberRow } from '@seta/planner';
import {
  Alert,
  AlertDescription,
  Avatar,
  AvatarFallback,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from '@seta/shared-ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { plannerClient } from '../api/planner-client';
import { useAddGroupMembers } from '../hooks/mutations/add-group-members';
import { plannerKeys } from '../state/query-keys';

interface Props {
  groupId: string;
  existingMembers: GroupMemberRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Candidate = { user_id: string; display_name: string; email: string };

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase();
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

  const candidatesQuery = useQuery({
    queryKey: plannerKeys.groupMemberCandidates(groupId, debouncedSearch),
    queryFn: () =>
      plannerClient.listGroupMemberCandidates({
        group_id: groupId,
        search: debouncedSearch || undefined,
        limit: 20,
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
            toast('Adding members in the background — the list will update in a moment.');
            setTimeout(() => {
              void qc.refetchQueries({ queryKey: plannerKeys.groupMembers(groupId) });
            }, 3000);
          }
          reset();
          onOpenChange(false);
        },
        onError: (e) => setError(e instanceof Error ? e.message : "Couldn't add members."),
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

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add members</DialogTitle>
        </DialogHeader>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((s) => (
              <span
                key={s.user_id}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs"
              >
                {s.display_name}
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  aria-label={`Remove ${s.display_name}`}
                  className="text-ink-muted hover:text-ink"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <div className="max-h-[260px] overflow-y-auto divide-y divide-hairline rounded-md border border-hairline">
          {candidatesQuery.isPending && (
            <p className="py-4 text-center text-sm text-ink-subtle">Searching…</p>
          )}
          {!candidatesQuery.isPending && candidates.length === 0 && (
            <p className="py-4 text-center text-sm text-ink-subtle">
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
                className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-surface-1 text-left"
              >
                <Checkbox
                  checked={isSelected}
                  aria-label={`Select ${c.display_name}`}
                  className="pointer-events-none"
                />
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className="text-xs">{initialsOf(c.display_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.display_name}</p>
                  <p className="text-xs text-ink-subtle truncate">{c.email}</p>
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selected.length === 0 || addMembers.isPending}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
