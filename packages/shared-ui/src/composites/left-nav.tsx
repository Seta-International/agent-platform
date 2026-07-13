import { SideNav } from '@astryxdesign/core/SideNav';
import type { AppManifest } from '@seta/module-sdk';
import * as React from 'react';
import { toSideNavSections } from './nav-sections';
import { DefaultShellLink, type ShellLinkComponent } from './shell-link';

export type { ShellLinkComponent, ShellLinkProps } from './shell-link';

export interface LeftNavProps {
  app: AppManifest;
  activeItemId?: string;
  linkComponent?: ShellLinkComponent;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  hideCollapse?: boolean;
  sessionFooter?: React.ReactNode;
  className?: string;
}

export function LeftNav({
  app,
  activeItemId,
  linkComponent,
  collapsed: collapsedProp,
  onCollapsedChange,
  hideCollapse = false,
  sessionFooter,
  className,
}: LeftNavProps) {
  const Link = linkComponent ?? DefaultShellLink;
  const [collapsedInternal, setCollapsedInternal] = React.useState(collapsedProp ?? false);
  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = (next: boolean) => {
    if (collapsedProp === undefined) setCollapsedInternal(next);
    onCollapsedChange?.(next);
  };

  const extensions = app.useNavExtensions();
  const sections = [...app.nav, ...extensions];

  return (
    <SideNav
      className={className}
      collapsible={
        hideCollapse
          ? { hasButton: false, isCollapsed: collapsed, onCollapsedChange: setCollapsed }
          : { isCollapsed: collapsed, onCollapsedChange: setCollapsed }
      }
      footerIcons={sessionFooter}
    >
      {toSideNavSections(sections, activeItemId, Link)}
    </SideNav>
  );
}
