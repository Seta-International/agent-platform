import { ASSIGNABLE_ROLES, PRODUCTS, productForNamespace } from '@seta/shared-rbac';
import {
  AlertDialog,
  Badge,
  Button,
  Checkbox,
  cn,
  Dialog,
  DialogFooter,
  DialogHeader,
  Heading,
  HStack,
  Input,
  Layout,
  LayoutContent,
  Selector,
  StackItem,
  Text,
  Textarea,
  Typeahead,
  useSeededItem,
  VStack,
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
    // Stack's cross-axis alignment has no "baseline" value (start | center | end | stretch) —
    // "center" is the closest approximation for lining up the icon against the heading/hint text.
    <HStack gap={2} vAlign="center">
      <Text color="secondary">{icon}</Text>
      <Heading level={3}>{title}</Heading>
      {hint && (
        <Text type="supporting" color="secondary">
          {hint}
        </Text>
      )}
    </HStack>
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
              <VStack gap={4} style={{ paddingTop: 'var(--spacing-1)' }}>
                <VStack gap={1.5}>
                  <Input
                    label="Name"
                    value={name}
                    onChange={(value) => setName(value)}
                    hasAutoFocus
                  />
                </VStack>
                <Textarea
                  label="Description"
                  value={description}
                  onChange={(value) => setDescription(value)}
                  placeholder="What this group is for (optional)"
                  rows={2}
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <DialogFooter>
              <Button variant="secondary" label="Cancel" onClick={() => setOpen(false)} />
              <Button
                variant="primary"
                label="Save"
                isDisabled={!name.trim() || update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: group.group_id, name: name.trim(), description: description.trim() },
                    { onSuccess: () => setOpen(false) },
                  )
                }
              />
            </DialogFooter>
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
          size="sm"
          width={160}
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
        className="text-disabled hover:text-error"
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
    // gap=7 has no native SpacingStep (scale skips 7/9/11/12) — style-based token gap instead.
    <VStack style={{ gap: 'var(--spacing-7)', padding: 'var(--spacing-7) var(--spacing-8)' }}>
      <VStack as="header" gap={3}>
        <HStack hAlign="between" vAlign="start" gap={4}>
          <StackItem size="fill">
            <VStack gap={1}>
              <HStack gap={2} vAlign="center">
                <Heading level={2} className="truncate">
                  {group.name}
                </Heading>
                {group.is_base && <Badge variant="neutral" label="Base" />}
                {group.kind === 'default' && <Badge variant="neutral" label="Default" />}
              </HStack>
              <Text type="code" size="sm" color="secondary" display="block">
                {group.slug}
              </Text>
            </VStack>
          </StackItem>
          <HStack gap={2} vAlign="center">
            {editable && <RenameDialog group={group} />}
            {editable && !group.is_base && (
              <DeleteGroupButton group={group} onDeleted={onDeleted} />
            )}
          </HStack>
        </HStack>

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
      </VStack>

      <VStack style={{ gap: 'var(--spacing-7)' }}>
        <VStack as="section" gap={3}>
          <SectionHeader
            icon={<ShieldCheck className="size-4" />}
            title="Roles"
            hint="Tick the roles everyone in this group inherits"
          />
          <div
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-container)',
              overflow: 'hidden',
            }}
          >
            {ROLE_GROUPS.map(({ module, product, roles }, moduleIndex) => (
              <div
                key={module}
                style={
                  moduleIndex < ROLE_GROUPS.length - 1
                    ? { borderBottom: '1px solid var(--color-border)' }
                    : undefined
                }
              >
                <HStack
                  gap={2}
                  vAlign="center"
                  style={{
                    padding: 'var(--spacing-2) var(--spacing-3)',
                    backgroundColor: 'var(--color-background-surface)',
                  }}
                >
                  <Text type="supporting" weight="medium" color="secondary">
                    {moduleDisplay(module)}
                  </Text>
                  {product && (
                    <Badge
                      variant="neutral"
                      className="font-normal"
                      label={PRODUCT_LABEL.get(product) ?? product}
                    />
                  )}
                </HStack>
                {/* keep: selectable checkbox+scope-control rows are a shape `List` can't express — plain ul/li */}
                <ul>
                  {roles.map((r, roleIndex) => {
                    const entry = roleEntries.find((e) => e.role_slug === r.slug);
                    const checked = entry != null;
                    return (
                      <li key={r.slug}>
                        <HStack
                          gap={3}
                          vAlign="center"
                          // keep: translucent accent/hover row tint has no plain-token utility —
                          // the Tailwind bridge exposes no bg-accent subtle/opacity variants.
                          className={cn(
                            'transition-colors',
                            checked
                              ? 'bg-accent-bg/[0.06] hover:bg-accent-bg/10'
                              : 'hover:bg-surface',
                          )}
                          style={{
                            padding: 'var(--spacing-2) var(--spacing-3)',
                            borderTop: roleIndex > 0 ? '1px solid var(--color-border)' : undefined,
                          }}
                        >
                          <StackItem size="fill">
                            <HStack gap={3} vAlign="center">
                              <Checkbox
                                label={r.label}
                                isLabelHidden
                                value={checked}
                                onChange={(v) => toggleRole(r.slug, v)}
                              />
                              <StackItem size="fill">
                                <VStack gap={0.5}>
                                  <Text weight="medium" display="block">
                                    {roleTail(r.slug)}
                                  </Text>
                                  {r.description && (
                                    <Text
                                      type="supporting"
                                      color="secondary"
                                      display="block"
                                      maxLines={1}
                                    >
                                      {r.description}
                                    </Text>
                                  )}
                                </VStack>
                              </StackItem>
                              <Text
                                type="code"
                                size="sm"
                                color="disabled"
                                style={{ flexShrink: 0 }}
                              >
                                {r.slug}
                              </Text>
                            </HStack>
                          </StackItem>
                          {entry && (
                            <RoleScopeControl
                              role={entry}
                              onChange={(scope_kind, scope_id) =>
                                setRoleScope(r.slug, scope_kind, scope_id)
                              }
                            />
                          )}
                        </HStack>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </VStack>

        <VStack as="section" gap={3}>
          <SectionHeader
            icon={<Boxes className="size-4" />}
            title="Product access"
            hint="Derived from roles"
          />
          {products.length > 0 ? (
            <HStack gap={1.5} wrap="wrap">
              {products.map((p) => (
                <Badge
                  key={p}
                  variant="neutral"
                  icon={<Layers className="size-3" aria-hidden />}
                  label={PRODUCT_LABEL.get(p) ?? p}
                />
              ))}
            </HStack>
          ) : (
            <Text color="secondary" display="block">
              No products yet — assign a product role above to grant app access.
            </Text>
          )}
        </VStack>
      </VStack>
    </VStack>
  );
}
