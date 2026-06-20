import { Calendar } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-04" → "Apr 2026" */
export function formatPeriod(period: string): string {
  const [year, month] = period.split('-');
  const label = MONTHS[Number(month) - 1];
  return label ? `${label} ${year}` : period;
}

// Above this many periods the pill row becomes a dropdown so it never overflows.
const PILL_LIMIT = 6;

interface PeriodFilterProps {
  periods: string[];
  value: string | null;
  onChange: (period: string) => void;
  disabled?: boolean;
}

/** Selects a real review period (YYYY-MM). Scales from a few pills to a dropdown. */
export function PeriodFilter({ periods, value, onChange, disabled }: PeriodFilterProps) {
  // Most-recent first (matches /periods order); ascending for the pill timeline.
  const desc = [...periods].sort((a, b) => (a < b ? 1 : -1));
  const asc = [...periods].sort();

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="flex items-center gap-1.5 text-caption text-ink-subtle shrink-0">
        <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden />
        Review period
      </span>

      {periods.length === 0 ? (
        <span className="px-3 py-1.5 text-body-sm text-ink-subtle">—</span>
      ) : periods.length <= PILL_LIMIT ? (
        // Few periods → pill group. flex-wrap so it never overflows horizontally.
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-2 border border-hairline flex-wrap">
          {asc.map((p) => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => onChange(p)}
              className={[
                'px-3 py-1.5 rounded-md text-body-sm font-medium transition-colors disabled:opacity-50',
                value === p
                  ? 'bg-canvas text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)] border border-hairline'
                  : 'text-ink-subtle hover:text-ink',
              ].join(' ')}
            >
              {formatPeriod(p)}
            </button>
          ))}
        </div>
      ) : (
        // Many periods → dropdown. Constant footprint regardless of count.
        <div className="relative">
          <select
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-hairline bg-surface-1 text-body-sm text-ink focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
          >
            {desc.map((p) => (
              <option key={p} value={p}>
                {formatPeriod(p)}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle text-caption">
            ▾
          </span>
        </div>
      )}
    </div>
  );
}
