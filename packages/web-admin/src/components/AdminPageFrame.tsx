import { Layout, LayoutContent, LayoutHeader, VStack } from '@seta/shared-ui';
import type { ReactNode } from 'react';
import { AdminPageHeader } from './AdminPageHeader.tsx';

/** Reading-width cap; 640 (Astryx's form width) cramps the two-column field grids. */
const CONTENT_WIDTH = 960;

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
   * centring inside a fixed column wastes screen and truncates columns.
   */
  isFullWidth?: boolean;
  children: ReactNode;
}

/**
 * Shared frame for every single-pane /admin page. The cap comes from `Layout`'s own
 * `contentWidth` so header and body share one column; capping only the body indents it
 * away from the header.
 */
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
      contentWidth={isFullWidth ? undefined : CONTENT_WIDTH}
      header={
        <>
          <AdminPageHeader crumb={crumb} title={title} subtitle={subtitle} actions={actions} />
          {subheader && <LayoutHeader padding={0}>{subheader}</LayoutHeader>}
        </>
      }
      content={
        <LayoutContent padding={6}>
          <VStack gap={8}>{children}</VStack>
        </LayoutContent>
      }
    />
  );
}
