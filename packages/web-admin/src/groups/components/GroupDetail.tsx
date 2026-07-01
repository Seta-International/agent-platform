import { ASSIGNABLE_ROLES, PRODUCTS, productForNamespace } from '@seta/shared-rbac';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Checkbox,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@seta/shared-ui';
import { Boxes, Layers, Pencil, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { StatBar, StatChip } from '../../components/access-console.tsx';
import type { Group } from '../api/groups-client.ts';
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
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" aria-hidden />
        Edit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="edit-group-name">Name</Label>
            <Input
              id="edit-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-group-description">Description</Label>
            <Textarea
              id="edit-group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this group is for (optional)"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || update.isPending}
            onClick={() =>
              update.mutate(
                { id: group.group_id, name: name.trim(), description: description.trim() },
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteGroupButton({ group, onDeleted }: { group: Group; onDeleted: () => void }) {
  const del = useDeleteGroup();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-ink-tertiary hover:text-destructive">
          <Trash2 className="size-3.5" aria-hidden />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{group.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Members lose the roles and product access this group grants. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-on-primary hover:bg-destructive/90"
            onClick={() => del.mutate(group.group_id, { onSuccess: onDeleted })}
          >
            Delete group
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function GroupDetail({ group, onDeleted }: { group: Group; onDeleted: () => void }) {
  const setRoles = useSetGroupRoles();
  const [roleValues, setRoleValues] = useState<string[]>(group.role_slugs);

  // Re-sync local role selection after a save round-trips fresh role_slugs.
  useEffect(() => setRoleValues(group.role_slugs), [group.role_slugs]);

  const handleRoleChange = (next: string[]) => {
    setRoleValues(next);
    setRoles.mutate({ id: group.group_id, role_slugs: next });
  };

  const toggleRole = (slug: string, on: boolean) => {
    handleRoleChange(on ? [...roleValues, slug] : roleValues.filter((s) => s !== slug));
  };

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
              {group.is_base && <Badge variant="secondary">Base</Badge>}
              {group.kind === 'default' && <Badge variant="outline">Default</Badge>}
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
                    <Badge variant="outline" className="font-normal">
                      {PRODUCT_LABEL.get(product) ?? product}
                    </Badge>
                  )}
                </div>
                <ul className="divide-y divide-hairline-tertiary">
                  {roles.map((r) => {
                    const checked = roleValues.includes(r.slug);
                    return (
                      <li key={r.slug}>
                        <label
                          htmlFor={`grouprole-${r.slug}`}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors',
                            checked
                              ? 'bg-primary/[0.06] hover:bg-primary/10'
                              : 'hover:bg-surface-2',
                          )}
                        >
                          <Checkbox
                            id={`grouprole-${r.slug}`}
                            checked={checked}
                            onCheckedChange={(v) => toggleRole(r.slug, v === true)}
                            aria-label={r.label}
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
                        </label>
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
                <Badge key={p} variant="secondary">
                  <Layers className="size-3" aria-hidden />
                  {PRODUCT_LABEL.get(p) ?? p}
                </Badge>
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
