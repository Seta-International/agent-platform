import { PRODUCTS, productForNamespace } from '@seta/shared-rbac';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  PageChrome,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { ListChecks, Lock, RotateCcw, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RailHeader, RailItem, StatBar, StatChip } from '../../components/access-console.tsx';
import type { MatrixRole } from '../api/role-access-client.ts';
import { useResetRole, useRoleAccessMatrix, useSetRolePermission } from '../hooks/useRoleAccess.ts';

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const moduleLabel = (m: string) => titleCase(m);
const roleShort = (slug: string) =>
  slug.split('.').slice(1).map(titleCase).join(' ') || titleCase(slug);

const PRODUCT_LABEL = new Map(PRODUCTS.map((p) => [p.id, p.label]));
const overrideCount = (role: MatrixRole) => role.cells.filter((c) => c.overridden).length;
const moduleOverrides = (roles: MatrixRole[]) => roles.reduce((n, r) => n + overrideCount(r), 0);

export function RoleAccess() {
  const { data, isLoading, error } = useRoleAccessMatrix();
  const canWrite = usePermission('identity.role.update');

  const modules = useMemo(() => {
    const seen: string[] = [];
    for (const r of data ?? []) if (!seen.includes(r.module)) seen.push(r.module);
    return seen;
  }, [data]);

  const [picked, setPicked] = useState<string | null>(null);
  const active = picked && modules.includes(picked) ? picked : (modules[0] ?? null);
  const roles = useMemo(() => (data ?? []).filter((r) => r.module === active), [data, active]);

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Role access"
      subtitle={
        isLoading ? 'Loading…' : `${modules.length} ${modules.length === 1 ? 'module' : 'modules'}`
      }
    >
      {error ? (
        <div className="page-container pt-4">
          <Alert variant="destructive">
            <AlertDescription>
              Couldn&apos;t load the access matrix: {(error as Error).message}
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <div className="flex h-full min-h-0">
          <aside className="flex w-72 flex-none flex-col border-r border-hairline bg-surface-1">
            <RailHeader>Modules</RailHeader>
            <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
              {isLoading || !data ? (
                <>
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </>
              ) : (
                modules.map((m) => {
                  const modRoles = data.filter((r) => r.module === m);
                  const changed = moduleOverrides(modRoles);
                  return (
                    <RailItem
                      key={m}
                      title={moduleLabel(m)}
                      active={m === active}
                      onClick={() => setPicked(m)}
                      count={modRoles.length}
                      subtitle={
                        changed > 0 ? (
                          <span className="text-primary">{changed} customised</span>
                        ) : (
                          <span>Built-in defaults</span>
                        )
                      }
                    />
                  );
                })
              )}
            </div>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto">
            {isLoading || !data ? (
              <div className="space-y-4 px-8 py-7">
                <Skeleton className="h-16 w-full max-w-md rounded-lg" />
                <Skeleton className="h-96 w-full rounded-lg" />
              </div>
            ) : (
              active && <ModuleDetail module={active} roles={roles} canWrite={canWrite} />
            )}
          </div>
        </div>
      )}
    </PageChrome>
  );
}

function ModuleDetail({
  module,
  roles,
  canWrite,
}: {
  module: string;
  roles: MatrixRole[];
  canWrite: boolean;
}) {
  const permissionCount = roles[0]?.cells.length ?? 0;
  const changed = moduleOverrides(roles);

  return (
    <div className="space-y-6 px-8 py-7">
      <header className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-card-title font-semibold tracking-tight text-ink">
            {moduleLabel(module)}
          </h2>
          <p className="text-body-sm text-ink-subtle">
            Built-in roles for the {moduleLabel(module)} module. Changes apply to everyone holding
            the role.
          </p>
        </div>

        <StatBar>
          <StatChip icon={<ShieldCheck className="size-4" />} value={roles.length} label="roles" />
          <StatChip
            icon={<ListChecks className="size-4" />}
            value={permissionCount}
            label="permissions"
          />
          <StatChip
            icon={<SlidersHorizontal className="size-4" />}
            value={changed}
            label="customised"
          />
        </StatBar>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-ink-subtle">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" aria-hidden />
            Changed from default
          </span>
          {!canWrite && (
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3" aria-hidden />
              View-only — you can&apos;t change permissions
            </span>
          )}
        </div>
      </header>

      {roles.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-hairline">
          <MatrixTable roles={roles} canWrite={canWrite} />
        </div>
      )}
    </div>
  );
}

function RoleColumnHeader({ role, canWrite }: { role: MatrixRole; canWrite: boolean }) {
  const reset = useResetRole();
  const product = productForNamespace(role.module);
  const modified = overrideCount(role);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-body-sm font-semibold tracking-tight text-ink">
          {roleShort(role.slug)}
        </span>
        {canWrite && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Reset ${role.slug} to defaults`}
            className="size-5 text-ink-tertiary transition-opacity disabled:pointer-events-none disabled:opacity-0"
            disabled={modified === 0 || reset.isPending}
            onClick={() => reset.mutate(role.slug)}
          >
            <RotateCcw className="size-3" aria-hidden />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1">
        {product && (
          <Badge variant="outline" className="font-normal">
            {PRODUCT_LABEL.get(product) ?? product}
          </Badge>
        )}
        {modified > 0 && (
          <span className="text-caption tabular-nums text-primary">{modified} changed</span>
        )}
      </div>
      <span className="font-mono text-caption font-normal text-ink-tertiary">{role.slug}</span>
    </div>
  );
}

function MatrixTable({ roles, canWrite }: { roles: MatrixRole[]; canWrite: boolean }) {
  const setPerm = useSetRolePermission();
  const keys =
    roles[0]?.cells.map((c) => ({ key: c.permission_key, description: c.description })) ?? [];
  const cellOf = (role: MatrixRole, key: string) =>
    role.cells.find((c) => c.permission_key === key);

  return (
    <Table>
      <TableHeader className="bg-surface-1 [&_tr]:border-b [&_tr]:border-hairline">
        <TableRow className="hover:bg-transparent">
          <TableHead className="sticky left-0 z-10 bg-surface-1 align-bottom">
            <span className="text-eyebrow uppercase text-ink-tertiary">Permission</span>
          </TableHead>
          {roles.map((role) => (
            <TableHead
              key={role.slug}
              className="min-w-44 border-l border-hairline-tertiary py-3 align-bottom"
            >
              <RoleColumnHeader role={role} canWrite={canWrite} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map(({ key, description }) => (
          <TableRow
            key={key}
            className="border-b border-hairline-tertiary transition-colors hover:bg-surface-2"
          >
            <TableCell className="sticky left-0 z-10 bg-canvas py-2.5">
              <div className="flex flex-col">
                <span className="text-body-sm text-ink">{description}</span>
                {description !== key && (
                  <span className="font-mono text-caption text-ink-tertiary">{key}</span>
                )}
              </div>
            </TableCell>
            {roles.map((role) => {
              const cell = cellOf(role, key);
              if (!cell)
                return (
                  <TableCell
                    key={role.slug}
                    className="border-l border-hairline-tertiary bg-surface-1/40"
                  />
                );
              return (
                <TableCell key={role.slug} className="border-l border-hairline-tertiary py-2.5">
                  <div className="relative inline-flex">
                    <Checkbox
                      checked={cell.effective}
                      disabled={!canWrite || setPerm.isPending}
                      aria-label={`${roleShort(role.slug)} — ${key}`}
                      onCheckedChange={(v) =>
                        setPerm.mutate({ role: role.slug, permission: key, enabled: v === true })
                      }
                    />
                    {cell.overridden && (
                      <span
                        className="absolute -right-1.5 -top-1.5 size-2 rounded-full border border-canvas bg-primary"
                        title="Changed from default"
                        aria-hidden
                      />
                    )}
                  </div>
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
