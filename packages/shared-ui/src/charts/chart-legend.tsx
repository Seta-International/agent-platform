export interface LegendItem {
  key: string;
  label: string;
  color: string;
}

/** Generic swatch legend. Share one legend across sibling charts instead of
 * repeating recharts' per-chart legend. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <span key={it.key} className="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
