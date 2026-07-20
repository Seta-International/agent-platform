import { Layout, LayoutContent, LayoutHeader, PageContainer, VStack } from '@seta/shared-ui';
import type { ReactNode } from 'react';
import { AdminPageHeader } from './AdminPageHeader.tsx';

export interface AdminPageFrameProps {
  /** Breadcrumb leaf under Admin. */
  crumb: string;
  title: string;
  /** Secondary text beside the title (counts, status summary). */
  subtitle?: ReactNode;
  /** Right-aligned header actions. */
  actions?: ReactNode;
  /**
   * Optional second header row (e.g. a filter `Toolbar`), rendered below the title block but
   * still inside the fixed header — outside the scrollable content region, so it stays pinned
   * while the page's data scrolls underneath it (data pages with their own filter/search bar).
   */
  subheader?: ReactNode;
  /**
   * Drops the reading-width cap so content spans the viewport. For wide data tables, where
   * centring inside a ~1180px column wastes screen and truncates columns. Padding is kept.
   */
  isFullWidth?: boolean;
  children: ReactNode;
}

/** Shared frame for every /admin page: breadcrumb, level-1 heading, actions, stacked content. */
export function AdminPageFrame({
  crumb,
  title,
  subtitle,
  actions,
  subheader,
  isFullWidth,
  children,
}: AdminPageFrameProps) {
  return (
    <Layout
      height="fill"
      header={
        <>
          <AdminPageHeader crumb={crumb} title={title} subtitle={subtitle} actions={actions} />
          {subheader && <LayoutHeader padding={0}>{subheader}</LayoutHeader>}
        </>
      }
      content={
        <LayoutContent padding={0}>
          <PageContainer className={isFullWidth ? 'max-w-none' : undefined}>
            <VStack gap={8}>{children}</VStack>
          </PageContainer>
        </LayoutContent>
      }
    />
  );
}
