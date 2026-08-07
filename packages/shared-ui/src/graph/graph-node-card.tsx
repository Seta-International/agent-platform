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
    card: 'bg-card border-border text-primary',
    title: 'text-primary',
    subtitle: 'text-secondary',
  },
  solid: {
    card: 'bg-primary border-transparent text-card',
    title: 'text-card',
    subtitle: 'text-card/70',
  },
  primary: {
    card: 'bg-card border-accent-bg text-primary',
    title: 'text-primary',
    subtitle: 'text-secondary',
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
  if (tone === 'primary') shadows.push('0 0 0 3px var(--color-accent-muted)');
  else if (selected) shadows.push('0 0 0 2px var(--color-accent)');
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
          'cursor-pointer hover:-translate-y-0.5 hover:border-accent-bg hover:shadow-lg',
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
        // The card already shows `title` next to the avatar, so Astryx's
        // name-on-hover tooltip would only duplicate it in the a11y tree.
        <Avatar name={title} src={avatarSrc} size={36} tooltip={false} />
      )}
      <div className="min-w-0">
        <div className={cn('truncate text-base font-semibold leading-tight', t.title)}>{title}</div>
        {subtitle && <div className={cn('truncate text-sm', t.subtitle)}>{subtitle}</div>}
      </div>
      {count !== undefined && (
        <span
          className="ml-auto shrink-0 rounded-pill px-2 py-0.5 text-sm font-bold"
          style={{ background: 'var(--color-accent-muted)', color: 'var(--color-text-accent)' }}
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
          className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-pill border border-border bg-card px-2 py-0.5 text-sm font-bold text-secondary shadow-sm hover:border-accent-bg"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {collapsed && descendantCount !== undefined && <span>{descendantCount}</span>}
        </button>
      )}
    </div>
  );
}
