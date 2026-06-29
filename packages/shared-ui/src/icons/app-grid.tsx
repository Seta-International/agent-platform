import type { SVGProps } from 'react';

/** Nine-dot "waffle" app-launcher glyph, matching the suite-shell mockup. */
export function AppGrid(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      {[5, 12, 19].map((cy) =>
        [5, 12, 19].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2} />),
      )}
    </svg>
  );
}
