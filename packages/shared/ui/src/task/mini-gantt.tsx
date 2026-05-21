import { differenceInDays, parseISO } from 'date-fns';

export const VIEW_WIDTH = 220;
const VIEW_HEIGHT = 56;
export const PADDING = 20;
const TICK_COUNT = 7;

export function xForDay(date: string, start: string, due: string): number {
  const drawable = VIEW_WIDTH - PADDING * 2;
  const span = Math.max(differenceInDays(parseISO(due), parseISO(start)), 1);
  const offset = differenceInDays(parseISO(date), parseISO(start));
  const ratio = Math.max(0, Math.min(1, offset / span));
  return PADDING + ratio * drawable;
}

interface Props {
  start: string | null;
  due: string | null;
  today: string;
  title: string;
}

export function MiniGantt({ start, due, today, title }: Props) {
  if (!start || !due) return null;

  const xStart = xForDay(start, start, due);
  const xDue = xForDay(due, start, due);
  const xToday = xForDay(today, start, due);

  const drawable = VIEW_WIDTH - PADDING * 2;
  const tickStep = drawable / (TICK_COUNT - 1);
  const tickXs = Array.from({ length: TICK_COUNT }, (_, i) => PADDING + i * tickStep);

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      width={VIEW_WIDTH}
      height={VIEW_HEIGHT}
      role="img"
      aria-label={`Schedule: ${title}`}
    >
      <title>{title}</title>
      {tickXs.map((x) => (
        <line
          key={x}
          x1={x}
          x2={x}
          y1={PADDING}
          y2={VIEW_HEIGHT - PADDING}
          stroke="var(--color-hairline)"
          strokeDasharray="2 3"
        />
      ))}
      <rect
        data-role="bar"
        x={xStart}
        y={VIEW_HEIGHT / 2 - 4}
        width={xDue - xStart}
        height={8}
        rx={4}
        fill="var(--color-primary)"
        opacity={0.85}
      />
      <line
        data-role="today"
        x1={xToday}
        x2={xToday}
        y1={PADDING - 4}
        y2={VIEW_HEIGHT - PADDING + 4}
        stroke="var(--color-warning)"
        strokeWidth={1.5}
      />
    </svg>
  );
}
