import { StatusDot as AstryxStatusDot, type StatusDotProps } from '@astryxdesign/core/StatusDot';
import type { CSSProperties } from 'react';

export type { StatusDotProps, StatusDotVariant } from '@astryxdesign/core/StatusDot';

// theme-neutral defines --color-warning as the warning *text* colour (#745b00 in light mode), so
// a dot filled with it reads brown, not amber. The theme itself re-points the token wherever it
// needs the chromatic fill (.astryx-badge.warning / .astryx-progressbar.warning → #ffce2f); this
// wrapper does the same for every StatusDot, keeping dot marks on the fill colour in both modes.
const WARNING_FILL = { '--color-warning': 'light-dark(#ffce2f, #fdcf4f)' } as CSSProperties;

export function StatusDot({ style, ...props }: StatusDotProps) {
  return <AstryxStatusDot {...props} style={{ ...WARNING_FILL, ...style }} />;
}
