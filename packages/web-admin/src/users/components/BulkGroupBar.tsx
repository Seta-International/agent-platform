import {
  Button,
  createStaticSource,
  Dialog,
  DialogHeader,
  Layout,
  LayoutFooter,
  type SearchableItem,
  Typeahead,
} from '@seta/shared-ui';
import { UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useGroupMembersMutations, useGroupsQuery } from '../../groups/hooks/useGroups.ts';

type GroupItem = SearchableItem<{ keywords: string[] }>;

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
  const [group, setGroup] = useState<GroupItem | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { data: groups } = useGroupsQuery();
  const { add } = useGroupMembersMutations();

  const groupItems = useMemo<GroupItem[]>(
    () =>
      (groups ?? []).map((g) => ({
        id: g.group_id,
        label: g.name,
        auxiliaryData: { keywords: [g.slug, ...g.roles.map((r) => r.role_slug)] },
      })),
    [groups],
  );
  const source = useMemo(
    () =>
      createStaticSource(groupItems, { keywords: (item) => item.auxiliaryData?.keywords ?? [] }),
    [groupItems],
  );

  const groupName = group?.label ?? '';
  const count = selectedUserIds.length;

  function handleConfirm() {
    if (!group) return;
    add.mutate(
      { id: group.id, user_ids: selectedUserIds },
      {
        onSuccess: () => {
          setConfirming(false);
          setGroup(null);
          onClearSelection();
        },
      },
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border bg-surface px-6 py-2">
        <span className="text-base font-medium text-primary">{count} selected</span>
        <Button variant="ghost" size="sm" label="Clear" onClick={onClearSelection} />
        <div className="ml-auto flex items-center gap-2">
          <Typeahead
            label="Group"
            isLabelHidden
            searchSource={source}
            debounceMs={0}
            hasEntriesOnFocus
            value={group}
            onChange={setGroup}
            placeholder="Add to group…"
            className="w-56"
          />
          <Button
            size="sm"
            isDisabled={!group || add.isPending}
            onClick={() => setConfirming(true)}
            icon={<UsersRound className="size-4" aria-hidden />}
            label="Add to group"
          />
        </div>
      </div>

      {/* Reversible action (people can be removed from the group afterward) — "form" purpose,
          not "required": mirrors the plan's "archive M365 group" precedent. */}
      <Dialog isOpen={confirming} onOpenChange={setConfirming} purpose="form">
        <Layout
          header={
            <DialogHeader
              title="Add to group?"
              subtitle={`Add ${count} ${count === 1 ? 'person' : 'people'} to “${groupName}”. They inherit the group’s roles and product access immediately.`}
              onOpenChange={setConfirming}
            />
          }
          footer={
            <LayoutFooter hasDivider>
              <Button variant="secondary" label="Cancel" onClick={() => setConfirming(false)} />
              <Button
                label={add.isPending ? 'Adding…' : 'Add to group'}
                isDisabled={add.isPending}
                onClick={handleConfirm}
              />
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
