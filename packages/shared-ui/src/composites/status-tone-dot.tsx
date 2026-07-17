import { StatusDot, type StatusDotVariant } from '../primitives/status-dot';

// Status tones → StatusDot. `primary` (In Progress) = blue; the theme's accent is
// achromatic, so override the dot color with an explicit icon-color token.
export type DotTone = 'muted' | 'primary' | 'warning' | 'success' | 'danger';
const DOT_TONE: Record<DotTone, { variant: StatusDotVariant; color?: string }> = {
  muted: { variant: 'neutral' },
  primary: { variant: 'accent', color: 'var(--color-icon-blue)' },
  warning: { variant: 'warning' },
  success: { variant: 'success' },
  danger: { variant: 'error' },
};

export function StatusToneDot({ tone, label }: { tone: DotTone; label: string }) {
  const { variant, color } = DOT_TONE[tone];
  return (
    <StatusDot
      variant={variant}
      label={label}
      aria-hidden="true"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
