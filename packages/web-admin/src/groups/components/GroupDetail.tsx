import { ASSIGNABLE_ROLES, PRODUCTS, productForNamespace } from '@seta/shared-rbac';
import {
  AlertDialog,
  Badge,
  Button,
  Checkbox,
  cn,
  Dialog,
  DialogHeader,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
  Selector,
  Textarea,
  Typeahead,
  useSeededItem,
} from '@seta/shared-ui';
import { Boxes, Layers, Pencil, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { orgUnitSearch } from '../../api/org-unit-search.ts';
import { StatBar, StatChip } from '../../components/access-console.tsx';
import type { Group, GroupRole } from '../api/groups-client.ts';
import { useDeleteGroup, useSetGroupRoles, useUpdateGroup } from '../hooks/useGroups.ts';
import {
  derivedProducts,
  moduleDisplay,
  type RoleMeta,
  roleMeta,
  roleTail,
} from '../lib/role-meta.ts';

const PRODUCT_LABEL = new Map(PRODUCTS.map((p) => [p.id, p.label]));

/** Assignable roles grouped by module, preserving first-seen order, for the picker matrix. */
const ROLE_GROUPS: {
  module: string;
  product: ReturnType<typeof productForNamespace>;
  roles: RoleMeta[];
}[] = (() => {
  const order: string[] = [];
  const byModule = new Map<string, RoleMeta[]>();
  for (const slug of ASSIGNABLE_ROLES) {
    const m = roleMeta(slug);
    let bucket = byModule.get(m.module);
    if (!bucket) {
      bucket = [];
      byModule.set(m.module, bucket);
      order.push(m.module);
    }
    bucket.push(m);
  }
  return order.map((module) => ({
    module,
    product: productForNamespace(module),
    roles: byModule.get(module) ?? [],
  }));
})();

function SectionHeader({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-ink-subtle">{icon}</span>
      <h3 className="text-body font-semibold tracking-tight text-ink">{title}</h3>
      {hint && <span className="text-caption text-ink-tertiary">{hint}</span>}
    </div>
  );
}

function RenameDialog({ group }: { group: Group }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState('');
  const update = useUpdateGroup();

  useEffect(() => {
    if (open) {
      setName(group.name);
      setDescription('');
    }
  }, [open, group.name]);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        label="Edit"
        icon={<Pencil className="size-3.5" aria-hidden />}
      />
      <Dialog isOpen={open} onOpenChange={setOpen} purpose="form">
        <Layout
          header={<DialogHeader title="Edit group" onOpenChange={setOpen} />}
          content={
            <LayoutContent>
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <Input
                    label="Name"
                    value={name}
                    onChange={(value) => setName(value)}
                    hasAutoFocus
                  />
                </div>
                <Textarea
                  label="Description"
                  value={description}
                  onChange={(value) => setDescription(value)}
                  placeholder="What this group is for (optional)"
                  rows={2}
                />
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <Button variant="secondary" label="Cancel" onClick={() => setOpen(false)} />
              <Button
                label="Save"
                isDisabled={!name.trim() || update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: group.group_id, name: name.trim(), description: description.trim() },
                    { onSuccess: () => setOpen(false) },
                  )
                }
              />
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}

const SCOPE_LABEL: Record<GroupRole['scope_kind'], string> = {
  tenant: 'Tenant-wide',
  org_unit: 'Org unit',
  self: 'Self',
};

const SCOPE_OPTIONS = (Object.keys(SCOPE_LABEL) as GroupRole['scope_kind'][]).map((value) => ({
  value,
  label: SCOPE_LABEL[value],
}));

/** Inline scope control for one checked role row: scope kind + (when org_unit) unit picker. */
function RoleScopeControl({
  role,
  onChange,
}: {
  role: GroupRole;
  onChange: (scope_kind: GroupRole['scope_kind'], scope_id: string | null) => void;
}) {
  // The role only carries a persisted scope_id — resolve it into a labelled item on
  // mount (and whenever the scope changes to a different org unit) so the picker shows
  // a name. Matched BY ID: the org-units endpoint ignores the `ids` filter and returns
  // the tenant's full list, so the first result is not necessarily the right one.
  const [scopeItem, setScopeItem] = useSeededItem(
    role.scope_kind === 'org_unit' ? role.scope_id : null,
    orgUnitSearch.seed,
  );

  return (
    <div className="flex flex-none items-center gap-1.5">
      <Selector
        label={`${role.role_slug} scope`}
        isLabelHidden
        size="sm"
        value={role.scope_kind}
        onChange={(v) => {
          const scope_kind = v as GroupRole['scope_kind'];
          onChange(scope_kind, scope_kind === 'org_unit' ? role.scope_id : null);
        }}
        options={SCOPE_OPTIONS}
      />
      {role.scope_kind === 'org_unit' && (
        <Typeahead
          label={`${role.role_slug} org unit`}
          isLabelHidden
          searchSource={orgUnitSearch.source}
          hasEntriesOnFocus
          value={scopeItem}
          onChange={(item) => {
            setScopeItem(item);
            onChange('org_unit', item?.id ?? null);
          }}
          placeholder="Org unit…"
          className="h-7 w-40 flex-none text-caption"
        />
      )}
    </div>
  );
}

function DeleteGroupButton({ group, onDeleted }: { group: Group; onDeleted: () => void }) {
  const del = useDeleteGroup();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-ink-tertiary hover:text-destructive"
        label="Delete"
        icon={<Trash2 className="size-3.5" aria-hidden />}
        onClick={() => setIsOpen(true)}
      />
      <AlertDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title={`Delete “${group.name}”?`}
        description="Members lose the roles and product access this group grants. This can’t be undone."
        actionLabel="Delete group"
        isActionLoading={del.isPending}
        onAction={() => del.mutate(group.group_id, { onSuccess: onDeleted })}
      />
    </>
  );
}

export function GroupDetail({ group, onDeleted }: { group: Group; onDeleted: () => void }) {
  const setRoles = useSetGroupRoles();
  const [roleEntries, setRoleEntries] = useState<GroupRole[]>(group.roles);

  // Re-sync local role selection after a save round-trips fresh roles.
  useEffect(() => setRoleEntries(group.roles), [group.roles]);

  const persistRoles = (next: GroupRole[]) => {
    setRoleEntries(next);
    setRoles.mutate({ id: group.group_id, roles: next });
  };

  const toggleRole = (slug: string, on: boolean) => {
    persistRoles(
      on
        ? [...roleEntries, { role_slug: slug, scope_kind: 'tenant', scope_id: null }]
        : roleEntries.filter((r) => r.role_slug !== slug),
    );
  };

  const setRoleScope = (
    slug: string,
    scope_kind: GroupRole['scope_kind'],
    scope_id: string | null,
  ) => {
    persistRoles(
      roleEntries.map((r) => (r.role_slug === slug ? { ...r, scope_kind, scope_id } : r)),
    );
  };

  const roleValues = roleEntries.map((r) => r.role_slug);
  const products = derivedProducts(roleValues);
  const editable = group.kind !== 'default';

  return (
    <div className="space-y-7 px-8 py-7">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-card-title font-semibold tracking-tight text-ink">
                {group.name}
              </h2>
              {group.is_base && <Badge variant="neutral" label="Base" />}
              {group.kind === 'default' && <Badge variant="neutral" label="Default" />}
            </div>
            <p className="font-mono text-caption text-ink-tertiary">{group.slug}</p>
          </div>
          <div className="flex flex-none items-center gap-2">
            {editable && <RenameDialog group={group} />}
            {editable && !group.is_base && (
              <DeleteGroupButton group={group} onDeleted={onDeleted} />
            )}
          </div>
        </div>

        <StatBar>
          <StatChip
            icon={<Users className="size-4" />}
            value={group.member_count}
            label="members"
          />
          <StatChip
            icon={<ShieldCheck className="size-4" />}
            value={roleValues.length}
            label="roles"
          />
          <StatChip icon={<Boxes className="size-4" />} value={products.length} label="products" />
        </StatBar>
      </header>

      <div className="space-y-7">
        <section className="space-y-3">
          <SectionHeader
            icon={<ShieldCheck className="size-4" />}
            title="Roles"
            hint="Tick the roles everyone in this group inherits"
          />
          <div className="overflow-hidden rounded-lg border border-hairline">
            {ROLE_GROUPS.map(({ module, product, roles }) => (
              <div key={module} className="border-b border-hairline last:border-b-0">
                <div className="flex items-center gap-2 border-b border-hairline-tertiary bg-surface-1 px-3.5 py-2">
                  <span className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">
                    {moduleDisplay(module)}
                  </span>
                  {product && (
                    <Badge
                      variant="neutral"
                      className="font-normal"
                      label={PRODUCT_LABEL.get(product) ?? product}
                    />
                  )}
                </div>
                <ul className="divide-y divide-hairline-tertiary">
                  {roles.map((r) => {
                    const entry = roleEntries.find((e) => e.role_slug === r.slug);
                    const checked = entry != null;
                    return (
                      <li key={r.slug}>
                        <div
                          className={cn(
                            'flex items-center gap-3 px-3.5 py-2.5 transition-colors',
                            checked
                              ? 'bg-primary/[0.06] hover:bg-primary/10'
                              : 'hover:bg-surface-2',
                          )}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <Checkbox
                              label={r.label}
                              isLabelHidden
                              value={checked}
                              onChange={(v) => toggleRole(r.slug, v)}
                            />
                            <div className="min-w-0 flex-1">
                              <span className="text-body-sm font-medium text-ink">
                                {roleTail(r.slug)}
                              </span>
                              {r.description && (
                                <p className="mt-0.5 truncate text-caption text-ink-subtle">
                                  {r.description}
                                </p>
                              )}
                            </div>
                            <span className="flex-none font-mono text-caption text-ink-tertiary">
                              {r.slug}
                            </span>
                          </div>
                          {entry && (
                            <RoleScopeControl
                              role={entry}
                              onChange={(scope_kind, scope_id) =>
                                setRoleScope(r.slug, scope_kind, scope_id)
                              }
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader
            icon={<Boxes className="size-4" />}
            title="Product access"
            hint="Derived from roles"
          />
          {products.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {products.map((p) => (
                <Badge
                  key={p}
                  variant="neutral"
                  icon={<Layers className="size-3" aria-hidden />}
                  label={PRODUCT_LABEL.get(p) ?? p}
                />
              ))}
            </div>
          ) : (
            <p className="text-body-sm text-ink-tertiary">
              No products yet — assign a product role above to grant app access.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
