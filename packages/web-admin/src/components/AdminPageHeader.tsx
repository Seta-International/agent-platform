import { BreadcrumbItem, Breadcrumbs, HStack, LayoutHeader, Text, VStack } from '@seta/shared-ui';
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
 * Shared breadcrumb + title row for every /admin page — also used directly by the two
 * master-detail pages, which need their own `Layout` panes instead of `AdminPageFrame`.
 *
 * Title uses `Text as="h1" size="lg"`, matching web-people and the rest of the product;
 * `Heading level={1}` renders 24px, which reads as a different app.
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
            <Text as="h1" size="lg" weight="semibold">
              {title}
            </Text>
            {subtitle && <Text color="secondary">{subtitle}</Text>}
          </HStack>
          {actions}
        </HStack>
      </VStack>
    </LayoutHeader>
  );
}
