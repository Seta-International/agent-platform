import type { GroupRow } from '@seta/planner';
import {
  Alert,
  AlertDescription,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  GroupTile,
  Input,
  Label,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@seta/shared-ui';
import { Link2, Shield, Users } from 'lucide-react';
import { useState } from 'react';
import { plannerClient } from '../api/planner-client';
import { useCreateGroup } from '../hooks/mutations/create-group';

type Theme = 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';
type Visibility = 'private' | 'public';
type DefaultRole = 'owner' | 'member';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (group: GroupRow) => void;
}

export function CreateGroupDialog({ open, onOpenChange, onCreated }: Props) {
  const createGroup = useCreateGroup();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [theme, setTheme] = useState<Theme>('blue');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [defaultRole, setDefaultRole] = useState<DefaultRole>('member');
  const [createStarterPlan, setCreateStarterPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setDescription('');
    setTheme('blue');
    setVisibility('private');
    setDefaultRole('member');
    setCreateStarterPlan(false);
    setError(null);
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required.');
      return;
    }
    createGroup.mutate(
      {
        name: trimmed,
        description: description.trim() || undefined,
        theme,
        visibility,
        default_role: defaultRole,
      },
      {
        onSuccess: (group) => {
          if (createStarterPlan) {
            plannerClient
              .createPlan({ group_id: group.id, name: `${trimmed} starter plan` })
              .catch(() => {
                // starter plan creation failure is non-blocking
              });
          }
          onCreated?.(group);
          reset();
          onOpenChange(false);
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create group.'),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="max-w-[600px]"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <GroupTile name={name || 'New group'} theme={theme} size={44} />
            <div>
              <div className="text-eyebrow uppercase tracking-wide text-ink-subtle">
                New group · Planner
              </div>
              <DialogTitle>Create a group</DialogTitle>
              <p className="mt-1 text-sm text-ink-subtle">
                Groups own plans and define who can see them.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cg-name">Group name</Label>
            <Input
              id="cg-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer Success"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cg-desc">Description (optional)</Label>
            <textarea
              id="cg-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this group work on?"
              className="block w-full min-h-[52px] resize-y rounded-md border border-hairline bg-canvas px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
            <p className="text-xs text-ink-subtle">Shown on the group page and in plan-lists.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {(['teal', 'purple', 'green', 'blue', 'pink', 'orange', 'red'] as const).map(
                  (c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      onClick={() => setTheme(c)}
                      style={{
                        background: `var(--color-group-theme-${c})`,
                        boxShadow:
                          theme === c
                            ? `0 0 0 2px var(--color-canvas), 0 0 0 4px var(--color-group-theme-${c})`
                            : undefined,
                      }}
                      className="size-7 rounded-md border-0"
                    />
                  ),
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="cg-role">Default member role</Label>
              <select
                id="cg-role"
                value={defaultRole}
                onChange={(e) => setDefaultRole(e.target.value as DefaultRole)}
                className="block h-9 w-full rounded-md border border-hairline bg-canvas px-3 text-sm"
              >
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    key: 'private' as const,
                    icon: Shield,
                    title: 'Private',
                    body: 'Only invited members can see plans and tasks.',
                  },
                  {
                    key: 'public' as const,
                    icon: Users,
                    title: 'Workspace',
                    body: 'Everyone in the workspace can find the group and request to join.',
                  },
                ] as const
              ).map((v) => {
                const Icon = v.icon;
                const active = visibility === v.key;
                return (
                  <>
                    {/* biome-ignore lint/a11y/useSemanticElements: custom radio card with rich content requires button, not input[radio] */}
                    <button
                      key={v.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setVisibility(v.key)}
                      className={cn(
                        'rounded-md border p-3 text-left',
                        active
                          ? 'border-primary shadow-[0_0_0_3px_var(--color-primary-tint)]'
                          : 'border-hairline',
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <Icon
                          className={cn('size-4', active ? 'text-primary' : 'text-ink-muted')}
                        />
                        <span className="font-medium">{v.title}</span>
                      </div>
                      <div className="text-xs text-ink-subtle">{v.body}</div>
                    </button>
                  </>
                );
              })}
            </div>
          </div>

          {/* IdP callout — IdP group sync is deferred to PR3; button disabled for now */}
          <div className="flex items-center gap-3 rounded-md border border-hairline bg-surface-1 px-3 py-2.5">
            <Link2 className="size-3.5 text-ink-muted" />
            <span className="flex-1 text-sm">
              Link to an <b>IdP group</b> to sync members automatically
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" variant="ghost" disabled>
                      Link group…
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Available after sync goes live</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Members chip-input is deferred — identity.searchUsers API is not yet exposed to the
              planner module. Members can be added from the group page after creation. */}
          <p className="text-xs text-ink-subtle italic">
            Add members from the group page after creation.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-hairline mt-2">
          <label className="inline-flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={createStarterPlan}
              onChange={(e) => setCreateStarterPlan(e.target.checked)}
            />
            Create a starter plan in this group
          </label>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-ink-tertiary">⌘ Return</span>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!name.trim() || createGroup.isPending}>
              Create group
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
