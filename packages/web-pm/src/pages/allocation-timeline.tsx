import { Lock } from 'lucide-react';
import { useMemo } from 'react';
import { formatDisplayDate } from './ra-shared.tsx';
import {
  buildMonthColumns,
  dayFractionRange,
  monthLabel,
  monthlyTotals,
  type TimelineSegment,
  todayFraction,
} from './ra-timeline-math.ts';

export interface TimelineRow extends TimelineSegment {
  key: string;
  label: string;
  isRestricted?: boolean;
  hasError?: boolean;
}

export interface GroupedTimelineRow {
  rowKey: string;
  projectKey: string;
  projectIndex: number;
  label: string;
  isRestricted?: boolean;
  hasError?: boolean;
  date_from: string;
  date_to: string | null;
  planned_pct: number;
  isFirstInProject: boolean;
  totalProjectSegments: number;
}

const LABEL_WIDTH = 224;
const DATE_COL_WIDTH = 112;
const PREFIX_WIDTH = LABEL_WIDTH + DATE_COL_WIDTH * 2;
// Below this per-month width the bars/labels get too cramped to read — past
// that point the chart scrolls horizontally instead of squeezing further.
const MIN_MONTH_WIDTH = 56;

// One categorical hue per project, cycled. Each bar pairs a soft tint fill with the
// matching vivid text, and its legend dot is the same hue's solid variant — so all
// periods of the same project share the same distinct colour.
const ROW_BAR_CLASSES = [
  'bg-blue-subtle text-blue-vivid',
  'bg-green-subtle text-green-vivid',
  'bg-orange-subtle text-orange-vivid',
  'bg-purple-subtle text-purple-vivid',
];
const ROW_DOT_CLASSES = ['bg-blue-vivid', 'bg-green-vivid', 'bg-orange-vivid', 'bg-purple-vivid'];

/**
 * Groups rows by project, ordering segments chronologically and ensuring
 * all allocation periods for the same project stay contiguous with unified
 * project color theming while preserving exact start/end dates for each period.
 */
export function groupTimelineRows(rows: TimelineRow[]): GroupedTimelineRow[] {
  if (rows.length === 0) return [];

  const groupMap = new Map<string, TimelineRow[]>();
  const groupOrder: string[] = [];

  for (const r of rows) {
    const key = r.isRestricted ? '__restricted__' : r.label;
    const list = groupMap.get(key);
    if (list) {
      list.push(r);
    } else {
      groupMap.set(key, [r]);
      groupOrder.push(key);
    }
  }

  // Sort project groups: regular projects in chronological order of earliest start, restricted last
  groupOrder.sort((a, b) => {
    if (a === '__restricted__') return 1;
    if (b === '__restricted__') return -1;
    const listA = groupMap.get(a) ?? [];
    const listB = groupMap.get(b) ?? [];
    const minA = listA.reduce(
      (min, s) => (!min || s.date_from < min ? s.date_from : min),
      listA[0]?.date_from ?? '',
    );
    const minB = listB.reduce(
      (min, s) => (!min || s.date_from < min ? s.date_from : min),
      listB[0]?.date_from ?? '',
    );
    return minA.localeCompare(minB);
  });

  const result: GroupedTimelineRow[] = [];

  groupOrder.forEach((groupKey, projectIndex) => {
    const segments = groupMap.get(groupKey) ?? [];
    segments.sort((a, b) => a.date_from.localeCompare(b.date_from));

    const isRestricted = segments.some((s) => s.isRestricted);
    const groupHasError = segments.some((s) => s.hasError);
    const label = isRestricted ? 'Restricted projects' : (segments[0]?.label ?? groupKey);

    segments.forEach((seg, segIdx) => {
      result.push({
        rowKey: seg.key,
        projectKey: groupKey,
        projectIndex,
        label,
        isRestricted,
        hasError: seg.hasError || groupHasError,
        date_from: seg.date_from,
        date_to: seg.date_to,
        planned_pct: seg.planned_pct,
        isFirstInProject: segIdx === 0,
        totalProjectSegments: segments.length,
      });
    });
  });

  return result;
}

/**
 * Lightweight Gantt-style chart of a person's allocations: grouped by project
 * so multiple allocation periods for the same project are visually connected
 * with consistent color theming while preserving exact start/end dates for each period.
 */
export function AllocationTimeline({ rows, todayIso }: { rows: TimelineRow[]; todayIso: string }) {
  const months = useMemo(() => buildMonthColumns(rows, todayIso), [rows, todayIso]);
  const totals = useMemo(() => monthlyTotals(rows, months), [rows, months]);
  const todayPos = useMemo(() => todayFraction(months, todayIso), [months, todayIso]);
  const groupedRows = useMemo(() => groupTimelineRows(rows), [rows]);

  if (rows.length === 0 || months.length === 0) return null;

  const gridTemplateColumns = `${LABEL_WIDTH}px ${DATE_COL_WIDTH}px ${DATE_COL_WIDTH}px repeat(${months.length}, minmax(${MIN_MONTH_WIDTH}px, 1fr))`;
  const totalRow = groupedRows.length + 2;
  const todayLeft = `calc(${PREFIX_WIDTH}px + (100% - ${PREFIX_WIDTH}px) * ${(todayPos / months.length).toFixed(6)})`;

  return (
    <div className="space-y-1.5">
      <div className="text-sm text-secondary">
        Allocation timeline{' '}
        <span className="text-secondary">
          ({monthLabel(months[0] as string)} – {monthLabel(months.at(-1) as string)})
        </span>
      </div>
      <div className="relative overflow-x-auto rounded-md border border-border">
        <div className="grid w-full text-sm" style={{ gridTemplateColumns }}>
          <div
            className="sticky left-0 z-10 border-b border-border bg-card px-2 py-1.5 font-medium text-primary"
            style={{ gridColumn: 1, gridRow: 1 }}
          >
            Project
          </div>
          <div
            className="border-b border-l border-border bg-card px-2 py-1.5 font-medium text-primary"
            style={{ gridColumn: 2, gridRow: 1 }}
          >
            Start date
          </div>
          <div
            className="border-b border-l border-border bg-card px-2 py-1.5 font-medium text-primary"
            style={{ gridColumn: 3, gridRow: 1 }}
          >
            End date
          </div>
          {months.map((m, i) => (
            <div
              key={m}
              className="border-b border-l border-border bg-card px-1 py-1.5 text-center font-medium text-primary"
              style={{ gridColumn: i + 4, gridRow: 1 }}
            >
              {monthLabel(m).split(' ')[0]}
            </div>
          ))}

          {groupedRows.map((row, rowIndex) => {
            const { start, end } = dayFractionRange(months, row.date_from, row.date_to);
            const isRestricted = row.isRestricted;
            const dot = row.hasError
              ? 'bg-error'
              : isRestricted
                ? 'bg-warning'
                : ROW_DOT_CLASSES[row.projectIndex % ROW_DOT_CLASSES.length];
            const bar = row.hasError
              ? 'bg-error-muted text-error font-semibold'
              : isRestricted
                ? 'bg-warning-muted text-warning border border-dashed border-warning'
                : ROW_BAR_CLASSES[row.projectIndex % ROW_BAR_CLASSES.length];

            return (
              <div className="contents" key={row.rowKey}>
                {row.isFirstInProject ? (
                  <div
                    className="sticky left-0 z-10 flex items-center gap-1.5 truncate border-b border-border bg-card px-2 py-2"
                    style={{
                      gridColumn: 1,
                      gridRow: `${rowIndex + 2} / ${rowIndex + 2 + row.totalProjectSegments}`,
                    }}
                    title={row.label}
                  >
                    {isRestricted ? (
                      <Lock className="size-3.5 shrink-0 text-amber-600" aria-label="Restricted" />
                    ) : (
                      <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                    )}
                    <span
                      className={`truncate ${
                        row.hasError
                          ? 'font-medium text-error'
                          : isRestricted
                            ? 'font-medium text-secondary italic'
                            : 'font-medium text-primary'
                      }`}
                    >
                      {row.label}
                    </span>
                  </div>
                ) : null}
                <div
                  className="whitespace-nowrap border-b border-l border-border px-2 py-2 font-mono text-secondary"
                  style={{ gridColumn: 2, gridRow: rowIndex + 2 }}
                >
                  {formatDisplayDate(row.date_from)}
                </div>
                <div
                  className="whitespace-nowrap border-b border-l border-border px-2 py-2 font-mono text-secondary"
                  style={{ gridColumn: 3, gridRow: rowIndex + 2 }}
                >
                  {row.date_to ? formatDisplayDate(row.date_to) : '—'}
                </div>
                <div
                  className="relative border-b border-border"
                  style={{ gridColumn: `4 / ${months.length + 4}`, gridRow: rowIndex + 2 }}
                >
                  <div
                    className={`absolute inset-y-1.5 flex items-center justify-center overflow-hidden rounded-md px-1 font-mono font-medium tabular-nums ${bar}`}
                    style={{
                      left: `${(start / months.length) * 100}%`,
                      width: `${((end - start) / months.length) * 100}%`,
                    }}
                    title={`${row.label}: ${formatDisplayDate(row.date_from)} – ${row.date_to ? formatDisplayDate(row.date_to) : 'Ongoing'} (${row.planned_pct}%)`}
                  >
                    {`${row.planned_pct}%`}
                  </div>
                </div>
              </div>
            );
          })}

          <div
            className="border-t-2 border-border-strong bg-card px-2 py-2 font-medium text-primary"
            style={{ gridColumn: 1, gridRow: totalRow }}
          >
            Total allocation
          </div>
          <div
            className="border-t-2 border-l border-border-strong bg-card"
            style={{ gridColumn: 2, gridRow: totalRow }}
          />
          <div
            className="border-t-2 border-l border-border-strong bg-card"
            style={{ gridColumn: 3, gridRow: totalRow }}
          />
          {totals.map((t, i) => (
            <div
              key={`total-${months[i]}`}
              className={`border-t-2 border-l border-border-strong px-1 py-2 text-center font-mono tabular-nums ${
                t > 100 ? 'bg-error-muted font-semibold text-error' : 'text-secondary'
              }`}
              style={{ gridColumn: i + 4, gridRow: totalRow }}
            >
              {t > 0 ? `${t}%` : ''}
            </div>
          ))}
        </div>

        <div
          className="pointer-events-none absolute top-0 bottom-0 border-l-2 border-dashed border-accent"
          style={{ left: todayLeft }}
          aria-hidden="true"
        />
      </div>
      <div className="flex items-center gap-1.5 text-sm text-secondary">
        <span className="inline-block h-3 w-0 border-l-2 border-dashed border-accent" /> Today
      </div>
    </div>
  );
}
