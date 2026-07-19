import { cn, Divider, HStack, Text, VStack } from '@seta/shared-ui';
import type * as React from 'react';
import { Children, Fragment } from 'react';

/**
 * Shared building blocks for the Access-control consoles (Groups, Role access)
 * so the two screens stay visually consistent: a left master rail + a detail
 * pane with a header summarised by stat chips.
 */

/**
 * Groups a row of {@link StatChip}s into a single divided readout so the summary
 * reads as one metric strip rather than a row of look-alike buttons.
 */
export function StatBar({ children }: { children: React.ReactNode }) {
  const chips = Children.toArray(children);
  return (
    // keep: inline-flex — Stack has no display prop; the stat strip must hug its chips, not fill the pane
    <HStack
      vAlign="stretch"
      style={{
        display: 'inline-flex',
        overflow: 'hidden',
        borderRadius: 'var(--radius-container)',
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-background-card)',
      }}
    >
      {chips.map((chip, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: chips are a static, ordered readout — no stable id to key by.
        <Fragment key={index}>
          {index > 0 && <Divider orientation="vertical" />}
          {chip}
        </Fragment>
      ))}
    </HStack>
  );
}

export function StatChip({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <HStack gap={2} vAlign="center" paddingInline={4} paddingBlock={2}>
      <Text color="disabled">{icon}</Text>
      <Text
        size="2xl"
        weight="semibold"
        color="primary"
        hasTabularNumbers
        style={{ lineHeight: 1 }}
      >
        {value}
      </Text>
      <Text
        type="supporting"
        color="disabled"
        className="uppercase" // keep: uppercase — Text has no casing prop; tracking-label style predates Astryx
        style={{ letterSpacing: '0.04em' }}
      >
        {label}
      </Text>
    </HStack>
  );
}

export function RailHeader({ children }: { children: React.ReactNode }) {
  return (
    <VStack
      paddingInline={3}
      paddingBlock={2}
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <Text
        type="supporting"
        weight="medium"
        color="secondary"
        className="uppercase" // keep: uppercase — Text has no casing prop; tracking-label style predates Astryx
        style={{ letterSpacing: '0.04em' }}
      >
        {children}
      </Text>
    </VStack>
  );
}

export interface RailItemProps {
  title: string;
  active: boolean;
  onClick: () => void;
  /** Trailing pill at the top-right (e.g. member or role count). */
  count?: React.ReactNode;
  /** Secondary line under the title (badges, hints). */
  subtitle?: React.ReactNode;
}

export function RailItem({ title, active, onClick, count, subtitle }: RailItemProps) {
  return (
    // keep: a full-width, left-aligned rail row with a title + count + subtitle isn't a
    // `Button` shape (Button centres its label and owns weight/size — see frontend rules).
    // keep: the static "selected" tint and :hover background share one Tailwind utility per
    // state; there's no plain-token equivalent for a themed hover pseudo-class (same reasoning
    // as GroupDetail.tsx's checked-row tint).
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn('group relative w-full', active ? 'bg-surface' : 'hover:bg-surface')}
      style={{
        borderRadius: 'var(--radius-element)',
        padding: 'var(--spacing-2) var(--spacing-3)',
        textAlign: 'start',
        transition: 'background-color 150ms ease',
      }}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 w-0.5"
          style={{
            top: 'var(--spacing-1-5)',
            bottom: 'var(--spacing-1-5)',
            borderRadius: 'var(--radius-inner)',
            backgroundColor: 'var(--color-accent-bg)',
          }}
        />
      )}
      <HStack hAlign="between" vAlign="center" gap={2}>
        <Text weight="medium" color="primary" className="truncate">
          {title}
        </Text>
        {count != null && (
          <HStack
            hAlign="center"
            vAlign="center"
            paddingInline={1.5}
            style={{
              height: 'var(--spacing-5)',
              minWidth: 'var(--spacing-5)',
              flex: 'none',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-background-card)',
            }}
          >
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {count}
            </Text>
          </HStack>
        )}
      </HStack>
      {/* No wrapper text styling: unlike the count pill, subtitle content is caller-composed
      (badges next to a plain text fragment) and each piece already carries its own styling —
      see GroupListItem / RoleAccess's ModuleDetail rail items. */}
      {subtitle != null && (
        <HStack gap={1.5} vAlign="center" style={{ marginTop: 'var(--spacing-1)' }}>
          {subtitle}
        </HStack>
      )}
    </button>
  );
}
