import { Layout, LayoutContent, LayoutHeader, VStack } from '@seta/shared-ui';
import type { ReactNode } from 'react';
import { AdminPageHeader } from './AdminPageHeader.tsx';

/** Astryx's form/settings reading width. */
const CONTENT_WIDTH = 640;

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
  /** Lets content span the viewport, for wide data tables. */
  isFullWidth?: boolean;
  children: ReactNode;
}

/**
 * Shared frame for every single-pane /admin page: the header spans edge to edge so its
 * actions sit at the viewport corner, while the body is capped and centred. `Layout`'s
 * `contentWidth` can't express that — it caps every slot, header included.
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
      header={
        <>
          <AdminPageHeader crumb={crumb} title={title} subtitle={subtitle} actions={actions} />
          {subheader && <LayoutHeader padding={0}>{subheader}</LayoutHeader>}
        </>
      }
      content={
        <LayoutContent padding={0}>
          <VStack
            gap={8}
            paddingInline={4}
            paddingBlock={6}
            style={isFullWidth ? undefined : { maxWidth: CONTENT_WIDTH, marginInline: 'auto' }}
          >
            {children}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
