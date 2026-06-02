import type { GroupRow } from '@seta/planner';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SegmentedControl,
  Textarea,
  toast,
} from '@seta/shared-ui';
import { useState } from 'react';
import { useUpdateGroup } from '../hooks/mutations/update-group';
import { THEME_HEX } from './GroupPlansSection';

type GroupTheme = GroupRow['theme'];
type GroupVisibility = GroupRow['visibility'];
type GroupDefaultRole = GroupRow['default_role'];

const THEME_KEYS: GroupTheme[] = ['teal', 'purple', 'green', 'blue', 'pink', 'orange', 'red'];

const VISIBILITY_OPTIONS = [
  { value: 'private' as const, label: 'Private' },
  { value: 'public' as const, label: 'Workspace' },
] as const;

const DEFAULT_ROLE_OPTIONS = [
  { value: 'member' as const, label: 'Member' },
  { value: 'owner' as const, label: 'Owner' },
] as const;

interface EditGroupDialogProps {
  group: GroupRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EditFormProps {
  group: GroupRow;
  onDone: () => void;
}

function EditForm({ group, onDone }: EditFormProps) {
  const updateGroup = useUpdateGroup(group.id);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [theme, setTheme] = useState<GroupTheme>(group.theme);
  const [visibility, setVisibility] = useState<GroupVisibility>(group.visibility);
  const [defaultRole, setDefaultRole] = useState<GroupDefaultRole>(group.default_role);
  const [error, setError] = useState<string | null>(null);

  const isM365 = group.external_source === 'm365';

  const trimmedName = name.trim();
  const trimmedDesc = description.trim() || null;

  const patch: Record<string, unknown> = {};
  if (!isM365 && trimmedName !== group.name) patch.name = trimmedName;
  if (!isM365 && trimmedDesc !== (group.description ?? null)) patch.description = trimmedDesc;
  if (theme !== group.theme) patch.theme = theme;
  if (visibility !== group.visibility) patch.visibility = visibility;
  if (defaultRole !== group.default_role) patch.default_role = defaultRole;

  const hasChanges = Object.keys(patch).length > 0;

  function submit() {
    if (!isM365 && !trimmedName) {
      setError('Give your group a name.');
      return;
    }
    if (!hasChanges) {
      onDone();
      return;
    }
    updateGroup.mutate(
      {
        expected_version: group.version,
        patch: patch as Parameters<typeof updateGroup.mutate>[0]['patch'],
      },
      {
        onSuccess: () => {
          toast('Group updated');
          onDone();
        },
        onError: (e) => setError(e instanceof Error ? e.message : "Couldn't update the group."),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="edit-group-name">Name</Label>
        <Input
          id="edit-group-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          disabled={isM365}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="edit-group-description">Description</Label>
        <Textarea
          id="edit-group-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Optional description…"
          disabled={isM365}
        />
      </div>

      {isM365 && (
        <p className="text-xs text-ink-subtle">
          Managed by Microsoft 365 — changes are pushed from M365 during sync.
        </p>
      )}

      <div className="space-y-1.5">
        <Label>Theme</Label>
        <div className="flex gap-2">
          {THEME_KEYS.map((t) => (
            <button
              key={t}
              type="button"
              aria-label={t}
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
              className={`size-6 rounded transition-shadow ${theme === t ? 'ring-2 ring-primary ring-offset-1' : 'hover:ring-1 hover:ring-hairline-strong'}`}
              style={{ background: THEME_HEX[t] }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Label>Visibility</Label>
        <SegmentedControl
          aria-label="Visibility"
          value={visibility}
          onValueChange={(v) => setVisibility(v as GroupVisibility)}
          options={VISIBILITY_OPTIONS}
          size="md"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Label>Default role for new members</Label>
        <SegmentedControl
          aria-label="Default role"
          value={defaultRole}
          onValueChange={(v) => setDefaultRole(v as GroupDefaultRole)}
          options={DEFAULT_ROLE_OPTIONS}
          size="md"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={!hasChanges || updateGroup.isPending || (!isM365 && !trimmedName)}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

export function EditGroupDialog({ group, open, onOpenChange }: EditGroupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit group</DialogTitle>
        </DialogHeader>
        {open && <EditForm group={group} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
