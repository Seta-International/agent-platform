import {
  BreadcrumbItem,
  Breadcrumbs,
  Heading,
  HStack,
  LayoutHeader,
  Text,
  VStack,
} from '@seta/shared-ui';
import type { ReactNode } from 'react';

export interface AdminPageHeaderProps {
  /** Breadcrumb leaf under Admin. */
  crumb: string;
  title: string;
  /** Secondary text beside the title (counts, status summary). */
  subtitle?: ReactNode;
  /** Right-aligned header actions. */
  actions?: ReactNode;
}

/**
 * Shared breadcrumb + level-1 heading row for every /admin page. Used by `AdminPageFrame`
 * (single-pane pages) and directly by the two master-detail pages (`Groups`, `RoleAccess`)
 * that hand-roll their own `Layout` because they need `start=`/`content=` panes instead of
 * the frame's single scrollable body.
 */
export function AdminPageHeader({ crumb, title, subtitle, actions }: AdminPageHeaderProps) {
  return (
    <LayoutHeader hasDivider padding={4}>
      <VStack gap={1}>
        <Breadcrumbs variant="supporting">
          <BreadcrumbItem href="/admin">Admin</BreadcrumbItem>
          <BreadcrumbItem isCurrent>{crumb}</BreadcrumbItem>
        </Breadcrumbs>
        <HStack hAlign="between" vAlign="center" gap={2}>
          <HStack gap={2} vAlign="center">
            <Heading level={1}>{title}</Heading>
            {subtitle && <Text color="secondary">{subtitle}</Text>}
          </HStack>
          {actions}
        </HStack>
      </VStack>
    </LayoutHeader>
  );
}
