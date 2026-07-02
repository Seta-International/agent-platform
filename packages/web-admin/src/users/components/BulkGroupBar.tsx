import {
  Button,
  Combobox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@seta/shared-ui';
import { UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useGroupMembersMutations, useGroupsQuery } from '../../groups/hooks/useGroups.ts';

interface Props {
  selectedUserIds: string[];
  onClearSelection: () => void;
}

/**
 * Group-first bulk assignment: add the selected people to a group so they
 * inherit its roles and product access. We assign to groups, not roles
 * directly — per-user role grants are the exception, handled in user detail.
 */
export function BulkGroupBar({ selectedUserIds, onClearSelection }: Props) {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { data: groups } = useGroupsQuery();
  const { add } = useGroupMembersMutations();

  const groupOptions = useMemo(
    () =>
      (groups ?? []).map((g) => ({
        value: g.group_id,
        label: g.name,
        keywords: [g.slug, ...g.roles.map((r) => r.role_slug)],
      })),
    [groups],
  );

  const groupName = groups?.find((g) => g.group_id === groupId)?.name ?? '';
  const count = selectedUserIds.length;

  function handleConfirm() {
    if (!groupId) return;
    add.mutate(
      { id: groupId, user_ids: selectedUserIds },
      {
        onSuccess: () => {
          setConfirming(false);
          setGroupId(null);
          onClearSelection();
        },
      },
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-hairline bg-surface-2 px-6 py-2">
        <span className="text-body-sm font-medium text-ink">{count} selected</span>
        <Button variant="tertiary" size="sm" onClick={onClearSelection}>
          Clear
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Combobox
            value={groupId}
            onChange={setGroupId}
            options={groupOptions}
            placeholder="Add to group…"
            searchPlaceholder="Search groups…"
            className="w-56"
            aria-label="Group"
          />
          <Button
            size="sm"
            disabled={!groupId || add.isPending}
            onClick={() => setConfirming(true)}
          >
            <UsersRound className="size-4" aria-hidden />
            Add to group
          </Button>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to group?</DialogTitle>
            <DialogDescription>
              Add {count} {count === 1 ? 'person' : 'people'} to “{groupName}”. They inherit the
              group’s roles and product access immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button disabled={add.isPending} onClick={handleConfirm}>
              {add.isPending ? 'Adding…' : 'Add to group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
