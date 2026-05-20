const COLOR_PALETTE = ['blue', 'green', 'amber', 'red', 'purple', 'teal'] as const;

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
  const c = color ?? COLOR_PALETTE[hashString(name) % COLOR_PALETTE.length];
  return <span className={`label-chip label-chip--${c}`}>{name}</span>;
}
