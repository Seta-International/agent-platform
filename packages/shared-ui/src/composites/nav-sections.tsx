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
  depth = 0,
): ReactNode {
  const hasChildren = !!item.children?.length;
  // A parent whose child is the active item shouldn't also paint its own
  // selected background — the double highlight (e.g. "Chat" + the open thread)
  // reads as noise. Let the deepest selected item own the emphasis.
  const childSelected = item.children?.some((c) => c.isSelected) ?? false;
  const selfSelected = (item.isSelected ?? activeItemId === item.id) && !childSelected;
  const node = (
    <SideNavItem
      key={item.id}
      // Link-less action items (e.g. "Show more", search-param thread jumps)
      // ride `onClick` and render as a button; `as`/`href` only apply with a route.
      as={item.to ? Link : undefined}
      label={item.label}
      icon={item.icon}
      // Nested items (recents, sub-nav) step down a level in visual weight.
      size={depth > 0 ? 'sm' : undefined}
      isSelected={selfSelected}
      isDisabled={item.disabled}
      href={item.disabled ? undefined : item.to}
      onClick={item.disabled ? undefined : item.onClick}
      collapsible={hasChildren ? (item.collapsible ?? undefined) : undefined}
      endContent={item.endContent ?? navItemEndContent(item)}
    >
      {item.children?.map((child) => toSideNavItem(child, activeItemId, Link, depth + 1))}
    </SideNavItem>
  );
  // SideNavItem renders its label as plain text and ignores className/style, so
  // italicize via an inherited font-style on a `display:contents` wrapper that
  // stays invisible to the SideNav's own flex layout.
  if (!item.italic) return node;
  return (
    <span key={item.id} style={{ display: 'contents', fontStyle: 'italic' }}>
      {node}
    </span>
  );
}

/**
 * Does any item in the tree explicitly claim selection?
 *
 * `activeItemId` is resolved by longest-prefix match over *static* nav items, so an
 * app-root item (People's "/people") prefix-matches every page in that app. A dynamic
 * item that knows its own route is exact knowledge; the prefix match is only a guess.
 * When the two disagree the guess has to yield, or both items light up at once.
 */
function hasExplicitSelection(items: readonly NavItem[]): boolean {
  return items.some((i) => i.isSelected === true || hasExplicitSelection(i.children ?? []));
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
  const resolvedActiveId = sections.some((s) => hasExplicitSelection(s.items))
    ? undefined
    : activeItemId;
  return sections
    .filter((section) => section.items.length > 0)
    .map((section, i) => (
      <SideNavSection
        key={section.label ?? `section-${i}`}
        title={section.label ?? 'Navigation'}
        isHeaderHidden={!section.label}
      >
        {section.items.map((item) => toSideNavItem(item, resolvedActiveId, Link))}
      </SideNavSection>
    ));
}
