/** Centered empty-state filler for a chart with no data. */
export function ChartEmpty({ message = 'No tasks yet' }: { message?: string }) {
  return (
    <div
      data-testid="plan-chart-empty"
      className="flex h-40 items-center justify-center text-body-sm text-ink-subtle"
    >
      {message}
    </div>
  );
}
