import { ASSIGNABLE_ROLES } from '@seta/shared-rbac';
import {
  Alert,
  AlertDescription,
  AsyncCombobox,
  Button,
  Card,
  Combobox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  PageChrome,
  Skeleton,
} from '@seta/shared-ui';
import { useState } from 'react';
import { useMemberSearch } from '../../feature-flags/api/member-search.ts';
import type { Group } from '../api/groups-client.ts';
import {
  useCreateGroup,
  useGroupMembersMutations,
  useGroupsQuery,
  useSetGroupRoles,
} from '../hooks/useGroups.ts';

const ROLE_OPTIONS = ASSIGNABLE_ROLES.map((r) => ({ value: r, label: r }));

function GroupRow({ group }: { group: Group }) {
  const setRolesMutation = useSetGroupRoles();
  const { add } = useGroupMembersMutations();
  const memberPicker = useMemberSearch();
  const [roleValues, setRoleValues] = useState<string[]>(group.role_slugs);
  const [pendingMembers, setPendingMembers] = useState<string[]>([]);

  const handleRoleChange = (next: string[]) => {
    setRoleValues(next);
    setRolesMutation.mutate({ id: group.group_id, role_slugs: next });
  };

  const handleAddMembers = () => {
    if (pendingMembers.length === 0) return;
    add.mutate(
      { id: group.group_id, user_ids: pendingMembers },
      { onSuccess: () => setPendingMembers([]) },
    );
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink">{group.name}</span>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-3 px-1.5 text-caption tabular-nums text-ink-subtle">
            {group.member_count}
          </span>
        </div>
        <span className="font-mono text-caption text-ink-tertiary">{group.slug}</span>
      </div>

      <div className="space-y-1.5">
        <Label className="text-eyebrow uppercase tracking-[0.04em] text-ink-tertiary">Roles</Label>
        <Combobox
          multiple
          value={roleValues}
          onChange={handleRoleChange}
          options={ROLE_OPTIONS}
          placeholder="Assign roles…"
          searchPlaceholder="Search roles…"
          aria-label={`Roles for ${group.name}`}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-eyebrow uppercase tracking-[0.04em] text-ink-tertiary">
          Add members
        </Label>
        <div className="flex gap-2">
          <AsyncCombobox
            multiple
            value={pendingMembers}
            onChange={setPendingMembers}
            search={memberPicker.search}
            resolveByIds={memberPicker.resolveByIds}
            placeholder="Search users to add…"
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={handleAddMembers}
            disabled={pendingMembers.length === 0 || add.isPending}
          >
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const createGroup = useCreateGroup();

  const reset = () => {
    setSlug('');
    setName('');
  };

  const handleSubmit = () => {
    if (!slug.trim() || !name.trim()) return;
    createGroup.mutate(
      { slug: slug.trim(), name: name.trim() },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>Create group</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="group-slug">Slug</Label>
            <Input
              id="group-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="hr-team"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="HR Team"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={!slug.trim() || !name.trim() || createGroup.isPending}
            >
              {createGroup.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GroupsPage() {
  const { data, isLoading, error } = useGroupsQuery();
  const groups = data ?? [];

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Groups"
      subtitle="Manage access groups and their role assignments."
      actions={<CreateGroupDialog />}
    >
      <div className="page-container space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <>
            <Skeleton className="h-36 w-full rounded-lg" />
            <Skeleton className="h-36 w-full rounded-lg" />
          </>
        ) : groups.length === 0 ? (
          <p className="rounded-md border border-dashed border-hairline px-4 py-8 text-center text-body-sm text-ink-tertiary">
            No groups. Create one to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <GroupRow key={g.group_id} group={g} />
            ))}
          </div>
        )}
      </div>
    </PageChrome>
  );
}
