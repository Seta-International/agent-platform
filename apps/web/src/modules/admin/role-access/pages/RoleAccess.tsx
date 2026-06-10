import {
  Alert,
  AlertDescription,
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
  Tabs,
  TabsList,
  TabsTrigger,
} from '@seta/shared-ui';
import { Lock, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePermission } from '@/modules/identity/components/Can.tsx';
import type { MatrixRole } from '../api/role-access-client.ts';
import { useResetRole, useRoleAccessMatrix, useSetRolePermission } from '../hooks/useRoleAccess.ts';

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const moduleLabel = (m: string) => titleCase(m);
const roleShort = (slug: string) =>
  slug.split('.').slice(1).map(titleCase).join(' ') || titleCase(slug);

export function RoleAccess() {
  const { data, isLoading, error } = useRoleAccessMatrix();
  const canWrite = usePermission('identity.role.write');

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
      subtitle="Tune what each built-in role can do. Changes apply to everyone in your organization who holds that role."
    >
      <div className="page-container space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn&apos;t load the access matrix: {(error as Error).message}
            </AlertDescription>
          </Alert>
        )}

        {!canWrite && !isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-2 px-4 py-2.5 text-body-sm text-ink-subtle">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            <span>You can view role permissions but not change them.</span>
          </div>
        )}

        {isLoading || !data ? (
          <Skeleton className="h-96 w-full rounded-lg" />
        ) : (
          <>
            <Tabs value={active ?? undefined} onValueChange={setPicked}>
              <TabsList className="flex-wrap">
                {modules.map((m) => (
                  <TabsTrigger key={m} value={m}>
                    {moduleLabel(m)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {roles.length > 0 && <MatrixTable roles={roles} canWrite={canWrite} />}
          </>
        )}
      </div>
    </PageChrome>
  );
}

function MatrixTable({ roles, canWrite }: { roles: MatrixRole[]; canWrite: boolean }) {
  const setPerm = useSetRolePermission();
  const reset = useResetRole();
  const keys =
    roles[0]?.cells.map((c) => ({ key: c.permission_key, description: c.description })) ?? [];
  const cellOf = (role: MatrixRole, key: string) =>
    role.cells.find((c) => c.permission_key === key);
  const roleHasOverride = (role: MatrixRole) => role.cells.some((c) => c.overridden);

  return (
    <section className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <header className="flex items-center justify-between gap-4 border-b border-hairline-tertiary px-5 py-3.5">
        <p className="m-0 text-body-sm text-ink-subtle">
          Each column is a role. A{' '}
          <span className="inline-flex items-center gap-1 align-middle">
            <span className="inline-block size-1.5 rounded-full bg-primary" /> dot
          </span>{' '}
          marks a permission changed from its default.
        </p>
      </header>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="sticky left-0 z-10 bg-canvas align-bottom">
              <span className="text-eyebrow uppercase text-ink-tertiary">Permission</span>
            </TableHead>
            {roles.map((role) => (
              <TableHead
                key={role.slug}
                className="min-w-40 border-l border-hairline-tertiary py-3 align-bottom"
              >
                <div className="flex flex-col gap-1.5">
                  <span className="text-body-sm font-semibold tracking-tight text-ink">
                    {roleShort(role.slug)}
                  </span>
                  <span className="font-mono text-caption font-normal text-ink-tertiary">
                    {role.slug}
                  </span>
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Reset ${role.slug} to defaults`}
                      className="-ml-2 h-7 w-fit gap-1.5 px-2 text-caption text-ink-muted disabled:opacity-40"
                      disabled={!roleHasOverride(role) || reset.isPending}
                      onClick={() => reset.mutate(role.slug)}
                    >
                      <RotateCcw className="size-3" aria-hidden />
                      Reset
                    </Button>
                  )}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map(({ key, description }) => (
            <TableRow key={key}>
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
                    <TableCell key={role.slug} className="border-l border-hairline-tertiary" />
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
    </section>
  );
}
