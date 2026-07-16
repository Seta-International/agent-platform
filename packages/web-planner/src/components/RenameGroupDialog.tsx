import type { GroupRow } from '@seta/planner';
import {
  Banner,
  Button,
  Dialog,
  DialogHeader,
  DisabledActionTooltip,
  Field,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
  SegmentedControl,
  Textarea,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useEffect, useId, useRef, useState } from 'react';
import { useUpdateGroup } from '../hooks/mutations/update-group';
import { PERMISSION_DENIED } from '../lib/permission-messages';
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

interface EditGroupFieldsProps {
  name: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  theme: GroupTheme;
  onThemeChange: (v: GroupTheme) => void;
  visibility: GroupVisibility;
  onVisibilityChange: (v: GroupVisibility) => void;
  defaultRole: GroupDefaultRole;
  onDefaultRoleChange: (v: GroupDefaultRole) => void;
  isM365: boolean;
  error: string | null;
  onSubmit: () => void;
}

/**
 * Presentational fields-only view — all state and the update mutation live in the parent
 * `EditGroupDialog` now that the Cancel/Save actions render in the dialog's `footer` slot
 * (Astryx `Layout`'s footer is a sibling of the content, so it can't reach into a
 * self-contained form's local state without lifting it).
 */
function EditGroupFields({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  theme,
  onThemeChange,
  visibility,
  onVisibilityChange,
  defaultRole,
  onDefaultRoleChange,
  isM365,
  error,
  onSubmit,
}: EditGroupFieldsProps) {
  const themeId = useId();
  const visibilityId = useId();
  const defaultRoleId = useId();
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Input
          label="Name"
          value={name}
          onChange={onNameChange}
          onEnter={onSubmit}
          isDisabled={isM365}
        />
      </div>

      <Textarea
        label="Description"
        value={description}
        onChange={onDescriptionChange}
        rows={2}
        placeholder="Optional description…"
        isDisabled={isM365}
      />

      {isM365 && (
        <p className="text-xs text-ink-subtle">
          Managed by Microsoft 365 — changes are pushed from M365 during sync.
        </p>
      )}

      <Field label="Theme" inputID={themeId} labelID={themeId} isGroupLabel>
        <fieldset aria-labelledby={themeId} className="flex gap-2">
          {THEME_KEYS.map((t) => (
            <button
              key={t}
              type="button"
              aria-label={t}
              aria-pressed={theme === t}
              onClick={() => onThemeChange(t)}
              className={`size-6 rounded transition-shadow ${theme === t ? 'ring-2 ring-primary ring-offset-1' : 'hover:ring-1 hover:ring-hairline-strong'}`}
              style={{ background: THEME_HEX[t] }}
            />
          ))}
        </fieldset>
      </Field>

      <Field label="Visibility" inputID={visibilityId} isGroupLabel>
        <SegmentedControl
          aria-label="Visibility"
          value={visibility}
          onValueChange={(v) => onVisibilityChange(v as GroupVisibility)}
          options={VISIBILITY_OPTIONS}
          size="md"
        />
      </Field>

      <Field label="Default role for new members" inputID={defaultRoleId} isGroupLabel>
        <SegmentedControl
          aria-label="Default role"
          value={defaultRole}
          onValueChange={(v) => onDefaultRoleChange(v as GroupDefaultRole)}
          options={DEFAULT_ROLE_OPTIONS}
          size="md"
        />
      </Field>

      {error && <Banner status="error" title={error} />}
    </div>
  );
}

export function EditGroupDialog({ group, open, onOpenChange }: EditGroupDialogProps) {
  const updateGroup = useUpdateGroup(group.id);
  const canUpdateGroup = usePermission('planner.group.update');
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [theme, setTheme] = useState<GroupTheme>(group.theme);
  const [visibility, setVisibility] = useState<GroupVisibility>(group.visibility);
  const [defaultRole, setDefaultRole] = useState<GroupDefaultRole>(group.default_role);
  const [error, setError] = useState<string | null>(null);

  const isM365 = group.external_source === 'm365';

  // Astryx's `Dialog` always mounts its children regardless of `isOpen` — unlike the old
  // Radix `{open && <EditForm .../>}` conditional mount, the fields no longer remount (and
  // thus no longer reset) on every open. Reproduce the same "always fresh on open" behavior
  // explicitly instead — but only on the closed→open transition, not on every render where
  // `group` gets a new object reference while the dialog is already open. `group` comes from
  // a react-query cache with default `refetchOnWindowFocus`; a background refetch that returns
  // content-different data produces a new reference (structural sharing), and resetting on
  // every such reference change would silently wipe an in-progress, unsaved edit. Track the
  // previous `open` value in a ref so the reset only fires exactly once per open.
  const wasOpen = useRef(open);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally excludes `group` — reset must fire only on the open transition, not on every `group` reference change while already open (see comment above).
  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened) return;
    setName(group.name);
    setDescription(group.description ?? '');
    setTheme(group.theme);
    setVisibility(group.visibility);
    setDefaultRole(group.default_role);
    setError(null);
  }, [open]);

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
      onOpenChange(false);
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
          onOpenChange(false);
        },
        onError: (e) => setError(e instanceof Error ? e.message : "Couldn't update the group."),
      },
    );
  }

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} width={560} purpose="form">
      <Layout
        header={<DialogHeader title="Edit group" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <EditGroupFields
              name={name}
              onNameChange={setName}
              description={description}
              onDescriptionChange={setDescription}
              theme={theme}
              onThemeChange={setTheme}
              visibility={visibility}
              onVisibilityChange={setVisibility}
              defaultRole={defaultRole}
              onDefaultRoleChange={setDefaultRole}
              isM365={isM365}
              error={error}
              onSubmit={submit}
            />
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Button variant="secondary" label="Cancel" onClick={() => onOpenChange(false)} />
            <DisabledActionTooltip disabled={!canUpdateGroup} reason={PERMISSION_DENIED.group.edit}>
              <Button
                label="Save"
                onClick={submit}
                isDisabled={
                  !canUpdateGroup ||
                  !hasChanges ||
                  updateGroup.isPending ||
                  (!isM365 && !trimmedName)
                }
              />
            </DisabledActionTooltip>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
