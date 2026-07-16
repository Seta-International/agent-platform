import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Avatar } from '../primitives/avatar';

export type GraphNodeTone = 'surface' | 'solid' | 'primary';

export interface GraphNodeCardProps {
  title: string;
  subtitle?: string;
  tone?: GraphNodeTone;
  avatarSrc?: string;
  avatarShape?: 'circle' | 'square';
  /** Glyph rendered in the avatar slot instead of name initials (signals node type). */
  icon?: ReactNode;
  /** Type accent color (any CSS color). Drives the left rail + icon/avatar tint. */
  accent?: string;
  count?: number;
  selected?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  descendantCount?: number;
  onToggleCollapse?: () => void;
}

const TONE: Record<GraphNodeTone, { card: string; title: string; subtitle: string }> = {
  surface: {
    card: 'bg-surface-1 border-hairline text-ink',
    title: 'text-ink',
    subtitle: 'text-ink-subtle',
  },
  solid: {
    card: 'bg-ink border-transparent text-surface-1',
    title: 'text-surface-1',
    subtitle: 'text-surface-1/70',
  },
  primary: {
    card: 'bg-surface-1 border-primary text-ink',
    title: 'text-ink',
    subtitle: 'text-ink-subtle',
  },
};

export function GraphNodeCard({
  title,
  subtitle,
  tone = 'surface',
  avatarSrc,
  avatarShape = 'circle',
  icon,
  accent,
  count,
  selected,
  interactive = true,
  onClick,
  className,
  collapsible,
  collapsed,
  descendantCount,
  onToggleCollapse,
}: GraphNodeCardProps) {
  const t = TONE[tone];
  const shapeCls = avatarShape === 'circle' ? 'rounded-full' : 'rounded-md';

  // Compose the box-shadow: a soft base, an optional type accent rail on the left, and the
  // primary/selected ring. Inline boxShadow overrides the `shadow-sm` class, so re-state the base.
  const shadows = ['0 1px 2px rgb(0 0 0 / 0.06)'];
  if (accent) shadows.push(`inset 3px 0 0 ${accent}`);
  if (tone === 'primary') shadows.push('0 0 0 3px var(--color-primary-tint)');
  else if (selected) shadows.push('0 0 0 2px var(--color-primary)');
  const ringStyle: CSSProperties = { boxShadow: shadows.join(', ') };

  // Icon nodes (department/account/project) tint their type glyph with the accent; person nodes
  // render an Avatar, which derives its own initials and colors from the name.
  const avatarStyle: CSSProperties = {
    background: accent ? `color-mix(in oklch, ${accent} 16%, transparent)` : undefined,
    color: accent,
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: div + role="button" keeps the node embeddable in a graph canvas node.
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      style={ringStyle}
      className={cn(
        'relative z-[1] flex min-w-[190px] items-center gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-sm transition',
        t.card,
        interactive &&
          'cursor-pointer hover:-translate-y-0.5 hover:border-primary-border hover:shadow-lg',
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center [&>svg]:h-[18px] [&>svg]:w-[18px]',
            shapeCls,
          )}
          style={avatarStyle}
          aria-hidden
        >
          {icon}
        </div>
      ) : (
        <Avatar name={title} src={avatarSrc} size={36} />
      )}
      <div className="min-w-0">
        <div className={cn('truncate text-body-sm font-semibold leading-tight', t.title)}>
          {title}
        </div>
        {subtitle && <div className={cn('truncate text-caption', t.subtitle)}>{subtitle}</div>}
      </div>
      {count !== undefined && (
        <span
          className="ml-auto shrink-0 rounded-pill px-2 py-0.5 text-caption font-bold"
          style={{ background: 'var(--color-primary-tint)', color: 'var(--color-primary-ink)' }}
        >
          {count}
        </span>
      )}
      {collapsible && (
        <button
          type="button"
          aria-label="toggle collapse"
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            onToggleCollapse?.();
          }}
          className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-pill border border-hairline bg-surface-1 px-2 py-0.5 text-caption font-bold text-ink-subtle shadow-sm hover:border-primary-border"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {collapsed && descendantCount !== undefined && <span>{descendantCount}</span>}
        </button>
      )}
    </div>
  );
}
