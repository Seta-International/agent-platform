import {
  BreadcrumbItem,
  Breadcrumbs,
  Heading,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageContainer,
  Text,
  VStack,
} from '@seta/shared-ui';
import type { ReactNode } from 'react';

export interface AdminPageFrameProps {
  /** Breadcrumb leaf under Admin. */
  crumb: string;
  title: string;
  /** Secondary text beside the title (counts, status summary). */
  subtitle?: ReactNode;
  /** Right-aligned header actions. */
  actions?: ReactNode;
  children: ReactNode;
}

/** Shared frame for every /admin page: breadcrumb, level-1 heading, actions, stacked content. */
export function AdminPageFrame({ crumb, title, subtitle, actions, children }: AdminPageFrameProps) {
  return (
    <Layout
      height="fill"
      header={
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
      }
      content={
        <LayoutContent padding={0}>
          <PageContainer>
            <VStack gap={8}>{children}</VStack>
          </PageContainer>
        </LayoutContent>
      }
    />
  );
}
