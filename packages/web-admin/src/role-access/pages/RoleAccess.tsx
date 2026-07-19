import { PRODUCTS, productForNamespace } from '@seta/shared-rbac';
import {
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Checkbox,
  Heading,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
  PageContainer,
  Skeleton,
  StackItem,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  VStack,
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

  const subtitle = isLoading
    ? 'Loading…'
    : `${modules.length} ${modules.length === 1 ? 'module' : 'modules'}`;

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/admin">Admin</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Role access</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Role access
                </Text>
                {subtitle && <Text color="secondary">{subtitle}</Text>}
              </HStack>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      start={
        error ? undefined : (
          <LayoutPanel hasDivider width={288} padding={0} isScrollable={false}>
            <VStack height="100%">
              <RailHeader>Modules</RailHeader>
              <StackItem size="fill" isScrollable>
                <VStack gap={0.5} padding={2}>
                  {isLoading || !data ? (
                    <>
                      <Skeleton height={40} radius={2} />
                      <Skeleton height={40} radius={2} />
                      <Skeleton height={40} radius={2} />
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
                              <Text type="supporting" color="accent">
                                {changed} customised
                              </Text>
                            ) : (
                              <Text type="supporting" color="disabled">
                                Built-in defaults
                              </Text>
                            )
                          }
                        />
                      );
                    })
                  )}
                </VStack>
              </StackItem>
            </VStack>
          </LayoutPanel>
        )
      }
      content={
        <LayoutContent padding={0}>
          {error ? (
            <PageContainer>
              <Banner
                status="error"
                title={<>Couldn&apos;t load the access matrix: {(error as Error).message}</>}
              />
            </PageContainer>
          ) : isLoading || !data ? (
            <VStack gap={4} style={{ padding: 'var(--spacing-7) var(--spacing-8)' }}>
              <Skeleton className="max-w-md" height={64} radius={3} />
              <Skeleton height={384} radius={3} />
            </VStack>
          ) : (
            active && <ModuleDetail module={active} roles={roles} canWrite={canWrite} />
          )}
        </LayoutContent>
      }
    />
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
    <VStack gap={6} style={{ padding: 'var(--spacing-7) var(--spacing-8)' }}>
      <VStack as="header" gap={3}>
        <VStack gap={1}>
          <Heading level={2}>{moduleLabel(module)}</Heading>
          <Text color="secondary" display="block">
            Built-in roles for the {moduleLabel(module)} module. Changes apply to everyone holding
            the role.
          </Text>
        </VStack>

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

        <HStack
          wrap="wrap"
          vAlign="center"
          style={{ columnGap: 'var(--spacing-4)', rowGap: 'var(--spacing-2)' }}
        >
          <HStack gap={1.5} vAlign="center">
            <span
              aria-hidden
              // keep: solid legend dot — a decorative marker with no Text/Icon equivalent;
              // sized and colored entirely from tokens (no raw hex/px).
              style={{
                display: 'inline-block',
                width: 'var(--spacing-2)',
                height: 'var(--spacing-2)',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-accent-bg)',
              }}
            />
            <Text type="supporting" color="secondary">
              Changed from default
            </Text>
          </HStack>
          {!canWrite && (
            <HStack gap={1.5} vAlign="center">
              <Lock className="size-3" aria-hidden />
              <Text type="supporting" color="secondary">
                View-only — you can&apos;t change permissions
              </Text>
            </HStack>
          )}
        </HStack>
      </VStack>

      {roles.length > 0 && (
        <div
          style={{
            overflowX: 'auto',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-container)',
          }}
        >
          <MatrixTable roles={roles} canWrite={canWrite} />
        </div>
      )}
    </VStack>
  );
}

function RoleColumnHeader({ role, canWrite }: { role: MatrixRole; canWrite: boolean }) {
  const reset = useResetRole();
  const product = productForNamespace(role.module);
  const modified = overrideCount(role);
  return (
    <VStack gap={1}>
      <HStack gap={1.5} vAlign="center">
        <Text weight="semibold">{roleShort(role.slug)}</Text>
        {canWrite && (
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            icon={<RotateCcw className="size-3" aria-hidden />}
            label={`Reset ${role.slug} to defaults`}
            className="size-5 text-disabled transition-opacity disabled:pointer-events-none disabled:opacity-0" // keep: Button has no compact icon-size variant or hover-reveal-visibility prop
            isDisabled={modified === 0 || reset.isPending}
            onClick={() => reset.mutate(role.slug)}
          />
        )}
      </HStack>
      <HStack gap={1} vAlign="center">
        {product && (
          <Badge
            variant="neutral"
            className="font-normal" // keep: font-normal — Badge has no weight prop; label defaults heavier
            label={PRODUCT_LABEL.get(product) ?? product}
          />
        )}
        {modified > 0 && (
          <Text type="supporting" color="accent" hasTabularNumbers>
            {modified} changed
          </Text>
        )}
      </HStack>
      <Text type="code" color="disabled">
        {role.slug}
      </Text>
    </VStack>
  );
}

function MatrixTable({ roles, canWrite }: { roles: MatrixRole[]; canWrite: boolean }) {
  const setPerm = useSetRolePermission();
  const keys =
    roles[0]?.cells.map((c) => ({ key: c.permission_key, description: c.description })) ?? [];
  const cellOf = (role: MatrixRole, key: string) =>
    role.cells.find((c) => c.permission_key === key);

  // Astryx owns density padding and dividers; this matrix draws its own column
  // separators and row rules (hairline-tertiary), so disable Astryx dividers to
  // avoid doubling. hasHover restores the row highlight the shadcn table had.
  // The sticky-column/border/bg classNames below are this matrix's own structural
  // chrome — Task 13 scope keeps the Table + Checkbox cells exactly as-is; only
  // surrounding markup normalizes (each line below is individually keep-commented
  // for the verification grep).
  return (
    <Table dividers="none" hasHover>
      <TableHeader>
        <TableRow isHeaderRow>
          <TableHeaderCell
            className="sticky left-0 z-10 bg-card align-bottom" // keep: matrix Table's own sticky first-column chrome — structure stays exact per Task 13 scope
          >
            <Text
              type="supporting"
              weight="medium"
              color="disabled"
              className="uppercase" // keep: uppercase — Text has no casing prop
            >
              Permission
            </Text>
          </TableHeaderCell>
          {roles.map((role) => (
            <TableHeaderCell
              key={role.slug}
              className="min-w-44 border-l border-border bg-card align-bottom" // keep: matrix Table's own column-separator chrome — structure stays exact per Task 13 scope
            >
              <RoleColumnHeader role={role} canWrite={canWrite} />
            </TableHeaderCell>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map(({ key, description }) => (
          <TableRow
            key={key}
            className="border-b border-border" // keep: matrix Table's own row-rule chrome — structure stays exact per Task 13 scope
          >
            <TableCell
              className="sticky left-0 z-10 bg-body" // keep: matrix Table's own sticky first-column chrome — structure stays exact per Task 13 scope
            >
              <VStack>
                <Text display="block">{description}</Text>
                {description !== key && (
                  <Text type="code" color="disabled" display="block">
                    {key}
                  </Text>
                )}
              </VStack>
            </TableCell>
            {roles.map((role) => {
              const cell = cellOf(role, key);
              if (!cell)
                return (
                  <TableCell
                    key={role.slug}
                    className="border-l border-border bg-card/40" // keep: matrix Table's own empty-cell chrome — structure stays exact per Task 13 scope
                  />
                );
              return (
                <TableCell
                  key={role.slug}
                  className="border-l border-border" // keep: matrix Table's own column-separator chrome — structure stays exact per Task 13 scope
                >
                  <div className="relative inline-flex">
                    {/* keep: relative/inline-flex positions the overridden-dot indicator over the Checkbox — part of the Checkbox cell's own structure (Task 13 scope) */}
                    <Checkbox
                      label={`${roleShort(role.slug)} — ${key}`}
                      isLabelHidden
                      value={cell.effective}
                      isDisabled={!canWrite || setPerm.isPending}
                      onChange={(v) =>
                        setPerm.mutate({ role: role.slug, permission: key, enabled: v })
                      }
                    />
                    {cell.overridden && (
                      <span
                        className="absolute -right-1.5 -top-1.5 size-2 rounded-full border border-body bg-accent-bg" // keep: Checkbox cell's overridden-dot indicator — structure stays exact per Task 13 scope
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
