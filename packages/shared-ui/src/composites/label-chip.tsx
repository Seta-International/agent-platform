import { Badge, type BadgeProps } from '../primitives/badge';

const COLOR_PALETTE = ['blue', 'green', 'amber', 'red', 'purple', 'teal'] as const;

// Badge has no amber — yellow is the nearest palette tint (accepted drift).
const BADGE_VARIANT: Record<string, BadgeProps['variant']> = {
  blue: 'blue',
  green: 'green',
  amber: 'yellow',
  red: 'red',
  purple: 'purple',
  teal: 'teal',
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface LabelChipProps {
  name: string;
  color?: string;
}

export function LabelChip({ name, color }: LabelChipProps) {
  const hashed = COLOR_PALETTE[hashString(name) % COLOR_PALETTE.length] ?? COLOR_PALETTE[0];
  const c = color ?? hashed;
  return <Badge label={name} variant={BADGE_VARIANT[c] ?? 'neutral'} data-label-color={c} />;
}
