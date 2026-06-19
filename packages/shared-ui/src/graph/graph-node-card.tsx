import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { cn } from '../lib/cn';
import { initialsOf } from '../lib/initials';
import { Avatar, AvatarFallback, AvatarImage } from '../primitives/avatar';

export type GraphNodeTone = 'surface' | 'solid' | 'primary';

export interface GraphNodeCardProps {
  title: string;
  subtitle?: string;
  tone?: GraphNodeTone;
  avatarSrc?: string;
  avatarShape?: 'circle' | 'square';
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

function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function GraphNodeCard({
  title,
  subtitle,
  tone = 'surface',
  avatarSrc,
  avatarShape = 'circle',
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
  const hue = hueFromString(title);
  const shapeCls = avatarShape === 'circle' ? 'rounded-full' : 'rounded-md';

  const ringStyle: CSSProperties | undefined =
    tone === 'primary'
      ? { boxShadow: '0 0 0 3px var(--color-primary-tint)' }
      : selected
        ? { boxShadow: '0 0 0 2px var(--color-primary)' }
        : undefined;

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
      <Avatar className={cn('h-9 w-9', shapeCls)}>
        {avatarSrc && <AvatarImage src={avatarSrc} alt={title} />}
        <AvatarFallback
          className={cn(shapeCls)}
          style={{ background: `hsl(${hue} 60% 88%)`, color: `hsl(${hue} 40% 22%)` }}
        >
          {initialsOf(title)}
        </AvatarFallback>
      </Avatar>
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
