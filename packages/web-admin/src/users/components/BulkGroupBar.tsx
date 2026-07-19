import {
  Button,
  createStaticSource,
  Dialog,
  DialogFooter,
  DialogHeader,
  HStack,
  Layout,
  type SearchableItem,
  Text,
  Typeahead,
} from '@seta/shared-ui';
import { Plus, UsersRound } from 'lucide-react';
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
      <HStack
        hAlign="between"
        vAlign="center"
        gap={3}
        style={{
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-background-surface)',
          padding: 'var(--spacing-2) var(--spacing-6)',
        }}
      >
        <HStack gap={3} vAlign="center">
          <Text weight="medium">{count} selected</Text>
          <Button variant="ghost" size="sm" label="Clear" onClick={onClearSelection} />
        </HStack>
        <HStack gap={2} vAlign="center">
          <Typeahead
            label="Group"
            isLabelHidden
            searchSource={source}
            debounceMs={0}
            hasEntriesOnFocus
            value={group}
            onChange={setGroup}
            placeholder="Add to group…"
            width={224}
          />
          <Button
            size="sm"
            isDisabled={!group || add.isPending}
            onClick={() => setConfirming(true)}
            icon={<UsersRound className="size-4" aria-hidden />}
            label="Add to group"
          />
        </HStack>
      </HStack>

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
            <DialogFooter>
              <Button variant="secondary" label="Cancel" onClick={() => setConfirming(false)} />
              <Button
                variant="primary"
                icon={<Plus className="size-4" />}
                label={add.isPending ? 'Adding…' : 'Add to group'}
                isDisabled={add.isPending}
                onClick={handleConfirm}
              />
            </DialogFooter>
          }
        />
      </Dialog>
    </>
  );
}
