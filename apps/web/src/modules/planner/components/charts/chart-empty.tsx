export function ChartEmpty({ message = 'No tasks yet' }: { message?: string }) {
  return (
    <div className="plan-chart-empty" data-testid="plan-chart-empty">
      {message}
    </div>
  );
}
