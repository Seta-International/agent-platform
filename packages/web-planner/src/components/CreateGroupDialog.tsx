import type { GroupRow } from '@seta/planner';
import {
  Banner,
  Button,
  cn,
  Dialog,
  DialogHeader,
  GroupTile,
  Input,
  Label,
  Layout,
  LayoutContent,
  LayoutFooter,
  Selector,
} from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link2, Shield, Users } from 'lucide-react';
import React, { useState } from 'react';
import { plannerClient } from '../api/planner-client';
import { LinkToM365Dialog } from '../components/LinkToM365Dialog';
import { useCreateGroup } from '../hooks/mutations/create-group';
import { plannerKeys } from '../state/query-keys';

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
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [theme, setTheme] = useState<Theme>('blue');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [defaultRole, setDefaultRole] = useState<DefaultRole>('member');
  const [createStarterPlan, setCreateStarterPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The dialog only collects data — nothing is created until "Create group".
  // A chosen M365 group is held here and linked after the group is created.
  const [m365Selection, setM365Selection] = useState<{
    external_id: string;
    display_name: string;
  } | null>(null);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

  function reset() {
    setName('');
    setDescription('');
    setTheme('blue');
    setVisibility('private');
    setDefaultRole('member');
    setCreateStarterPlan(false);
    setError(null);
    setM365Selection(null);
    setLinkPickerOpen(false);
  }

  function submit() {
    if (createGroup.isPending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your group a name.');
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
        onSuccess: async (group) => {
          if (createStarterPlan) {
            plannerClient
              .createPlan({ group_id: group.id, name: `${trimmed} starter plan` })
              .catch(() => {
                // starter plan creation failure is non-blocking
              });
          }
          if (m365Selection) {
            try {
              await plannerClient.linkGroupToM365({
                groupId: group.id,
                externalId: m365Selection.external_id,
              });
              void qc.invalidateQueries({ queryKey: plannerKeys.groupsWithCounts() });
            } catch (e) {
              onCreated?.(group);
              setError(
                `Group created, but linking to Microsoft 365 failed: ${
                  e instanceof Error ? e.message : 'unknown error'
                }`,
              );
              return;
            }
          }
          onCreated?.(group);
          reset();
          onOpenChange(false);
        },
        onError: (e) => setError(e instanceof Error ? e.message : "Couldn't create the group."),
      },
    );
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  return (
    <>
      <Dialog
        isOpen={open}
        onOpenChange={handleOpenChange}
        purpose="form"
        width={560}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
      >
        <Layout
          header={
            <DialogHeader
              title="New group"
              subtitle="Groups hold plans together and decide who can see them."
              startContent={<GroupTile name={name || 'New group'} theme={theme} size={44} />}
              onOpenChange={handleOpenChange}
            />
          }
          content={
            <LayoutContent>
              <div className="text-eyebrow uppercase tracking-wide text-ink-subtle">
                New group · Planner
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <Input
                    label="Group name"
                    value={name}
                    onChange={(value) => setName(value)}
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
                  <p className="text-xs text-ink-subtle">
                    Shown on the group page and in plan lists.
                  </p>
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
                    <Selector
                      label="Default member role"
                      options={[
                        { value: 'member', label: 'Member' },
                        { value: 'owner', label: 'Owner' },
                      ]}
                      value={defaultRole}
                      onChange={(v) => setDefaultRole(v as DefaultRole)}
                    />
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
                        <React.Fragment key={v.key}>
                          {/* biome-ignore lint/a11y/useSemanticElements: custom radio card with rich content requires button, not input[radio] */}
                          <button
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
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* IdP callout — "Link…" only picks an M365 group; the group is created
                  (and then linked) when "Create group" is pressed. */}
                <div className="flex items-center gap-3 rounded-md border border-hairline bg-surface-1 px-3 py-2.5">
                  <Link2 className="size-3.5 text-ink-muted" />
                  {m365Selection ? (
                    <>
                      <span className="flex-1 text-sm">
                        Will link to <b>{m365Selection.display_name}</b> on create
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        label="Clear"
                        onClick={() => setM365Selection(null)}
                      />
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">
                        Link with a <b>Microsoft 365 group</b> to keep members in sync
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        label="Link…"
                        onClick={() => setLinkPickerOpen(true)}
                      />
                    </>
                  )}
                </div>

                {error && <Banner status="error" title={error} />}

                {/* Members chip-input is deferred — identity.searchUsers API is not yet exposed to the
                  planner module. Members can be added from the group page after creation. */}
                <p className="text-xs text-ink-subtle italic">
                  You can add members from the group page after you create it.
                </p>
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <div className="flex w-full items-center justify-between">
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
                  <Button
                    variant="secondary"
                    label="Cancel"
                    onClick={() => {
                      reset();
                      onOpenChange(false);
                    }}
                  />
                  <Button
                    label="Create group"
                    onClick={() => submit()}
                    isDisabled={!name.trim() || createGroup.isPending}
                  />
                </div>
              </div>
            </LayoutFooter>
          }
        />
      </Dialog>
      <LinkToM365Dialog
        open={linkPickerOpen}
        onOpenChange={setLinkPickerOpen}
        onSelect={(g) => {
          setM365Selection({ external_id: g.external_id, display_name: g.display_name });
          // Prefill the description from the M365 group (it owns it once linked),
          // but never clobber something the user already typed.
          if (!description.trim() && g.description) setDescription(g.description);
          setLinkPickerOpen(false);
        }}
      />
    </>
  );
}
