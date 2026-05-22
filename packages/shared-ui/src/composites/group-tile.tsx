import type { CSSProperties } from 'react';

export type GroupTheme = 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';

interface Props {
  name: string;
  theme: GroupTheme;
  size?: number;
  className?: string;
}

export function GroupTile({ name, theme, size = 36, className }: Props) {
  const tokens = name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = tokens.map((t) => t[0]?.toUpperCase()).join('');

  const color = `var(--color-group-theme-${theme})`;
  const radius = size <= 28 ? 5 : 7;

  const wrapStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    background: color,
    position: 'relative',
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  const overlayStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'rgba(255,255,255,0.78)',
  };

  const textStyle: CSSProperties = {
    position: 'relative',
    fontWeight: 700,
    color,
    fontSize: size * 0.36,
    letterSpacing: '-0.01em',
  };

  return (
    <div style={wrapStyle} className={className} aria-hidden="true">
      <div style={overlayStyle} />
      <span style={textStyle}>{initials}</span>
    </div>
  );
}
