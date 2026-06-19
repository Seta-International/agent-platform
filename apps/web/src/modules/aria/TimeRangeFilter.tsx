import { Calendar, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export type TimePreset = 'day' | 'week' | 'month' | 'quarter';

const PRESETS: { value: TimePreset; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
];

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getRange(preset: TimePreset): { start: Date; end: Date } {
  const now = new Date(2026, 5, 19); // Jun 19 2026 (demo anchor)
  const end = new Date(now);

  if (preset === 'day') {
    return { start: new Date(now), end };
  }
  if (preset === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // Sunday of this week
    return { start, end };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end };
  }
  // quarter
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), q * 3, 1);
  return { start, end };
}

function rangeLabel(preset: TimePreset): string {
  const { start, end } = getRange(preset);
  if (preset === 'day') return formatDate(start);
  if (start.getFullYear() === end.getFullYear()) {
    return `${formatDateShort(start)} – ${formatDate(end)}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

interface TimeRangeFilterProps {
  value: TimePreset;
  onChange: (v: TimePreset) => void;
}

export function TimeRangeFilter({ value, onChange }: TimeRangeFilterProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Quick preset pills */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-2 border border-hairline">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            className={[
              'px-3 py-1.5 rounded-md text-body-sm font-medium transition-colors',
              value === p.value
                ? 'bg-canvas text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)] border border-hairline'
                : 'text-ink-subtle hover:text-ink',
            ].join(' ')}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Date range display / custom trigger */}
      <div style={{ position: 'relative' }}>
        {/* Trigger button */}
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className={[
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-body-sm transition-colors',
            pickerOpen
              ? 'border-primary/50 text-ink bg-primary-tint'
              : 'border-hairline text-ink-subtle hover:border-hairline-strong hover:text-ink',
          ].join(' ')}
        >
          <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span>{rangeLabel(value)}</span>
          <ChevronDown
            className={[
              'w-3 h-3 shrink-0 transition-transform',
              pickerOpen ? 'rotate-180' : '',
            ].join(' ')}
            aria-hidden
          />
        </button>

        {/* Popover */}
        {pickerOpen && (
          <>
            {/* Backdrop — closes picker on outside click */}
            <button
              type="button"
              aria-label="Close date picker"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 49,
                background: 'transparent',
                border: 'none',
                cursor: 'default',
                padding: 0,
              }}
              onClick={() => setPickerOpen(false)}
            />
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                zIndex: 50,
                minWidth: 260,
              }}
              className="rounded-xl border border-hairline bg-canvas shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden"
            >
              {/* Quick presets */}
              <div className="px-3 pt-3 pb-2">
                <p className="text-caption text-ink-tertiary font-medium uppercase tracking-wide mb-2">
                  Quick select
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { label: 'Today', preset: 'day' as TimePreset },
                      { label: 'This Week', preset: 'week' as TimePreset },
                      { label: 'This Month', preset: 'month' as TimePreset },
                      { label: 'This Quarter', preset: 'quarter' as TimePreset },
                    ] as { label: string; preset: TimePreset }[]
                  ).map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        onChange(item.preset);
                        setPickerOpen(false);
                      }}
                      className={[
                        'px-3 py-1.5 rounded-md text-body-sm text-left transition-colors',
                        value === item.preset
                          ? 'bg-primary-tint text-primary-ink font-medium'
                          : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                      ].join(' ')}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-hairline mx-3" />

              {/* Custom range inputs */}
              <div className="px-3 py-3 space-y-2">
                <p className="text-caption text-ink-tertiary font-medium uppercase tracking-wide">
                  Custom range
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-ink-tertiary">From</span>
                    <input
                      type="date"
                      defaultValue="2026-06-01"
                      className="px-2 py-1.5 rounded-md border border-hairline bg-surface-1 text-body-sm text-ink focus:outline-none focus:border-primary/50 transition-colors"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-ink-tertiary">To</span>
                    <input
                      type="date"
                      defaultValue="2026-06-19"
                      className="px-2 py-1.5 rounded-md border border-hairline bg-surface-1 text-body-sm text-ink focus:outline-none focus:border-primary/50 transition-colors"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="w-full px-3 py-1.5 rounded-md bg-primary text-[white] text-body-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function useTimeRange(initial: TimePreset = 'month') {
  return useState<TimePreset>(initial);
}
