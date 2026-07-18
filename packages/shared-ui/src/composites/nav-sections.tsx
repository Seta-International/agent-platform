import { SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import type { NavBadgeTone, NavItem, NavSection } from '@seta/module-sdk';
import type { ReactNode } from 'react';
import type { ShellLinkComponent } from './shell-link';

const STATUS_DOT_VARIANT: Record<
  NavBadgeTone,
  'accent' | 'warning' | 'error' | 'success' | 'neutral'
> = {
  primary: 'accent',
  warning: 'warning',
  danger: 'error',
  success: 'success',
  muted: 'neutral',
};

const BADGE_TONE_LABEL: Record<NavBadgeTone, string> = {
  primary: 'Primary',
  warning: 'Warning',
  danger: 'Danger',
  success: 'Success',
  muted: 'Muted',
};

function navItemEndContent(item: NavItem): ReactNode {
  if (!item.badgeTone && item.badge == null) return undefined;
  return (
    <>
      {item.badgeTone && (
        <StatusDot
          variant={STATUS_DOT_VARIANT[item.badgeTone]}
          label={BADGE_TONE_LABEL[item.badgeTone]}
        />
      )}
      {item.badge != null && <span>{item.badge}</span>}
    </>
  );
}

function toSideNavItem(
  item: NavItem,
  activeItemId: string | undefined,
  Link: ShellLinkComponent,
): ReactNode {
  const hasChildren = !!item.children?.length;
  return (
    <SideNavItem
      key={item.id}
      // Link-less action items (e.g. "Show more", search-param thread jumps)
      // ride `onClick` and render as a button; `as`/`href` only apply with a route.
      as={item.to ? Link : undefined}
      label={item.label}
      icon={item.icon}
      isSelected={item.isSelected ?? activeItemId === item.id}
      isDisabled={item.disabled}
      href={item.disabled ? undefined : item.to}
      onClick={item.disabled ? undefined : item.onClick}
      collapsible={hasChildren ? (item.collapsible ?? undefined) : undefined}
      endContent={navItemEndContent(item)}
    >
      {item.children?.map((child) => toSideNavItem(child, activeItemId, Link))}
    </SideNavItem>
  );
}

/**
 * Converts an app's nav sections into Astryx SideNav's section/item tree.
 * Sections with zero visible items are dropped.
 */
export function toSideNavSections(
  sections: NavSection[],
  activeItemId: string | undefined,
  Link: ShellLinkComponent,
): ReactNode {
  return sections
    .filter((section) => section.items.length > 0)
    .map((section, i) => (
      <SideNavSection
        key={section.label ?? `section-${i}`}
        title={section.label ?? 'Navigation'}
        isHeaderHidden={!section.label}
      >
        {section.items.map((item) => toSideNavItem(item, activeItemId, Link))}
      </SideNavSection>
    ));
}
