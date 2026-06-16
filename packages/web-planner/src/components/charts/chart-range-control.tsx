import { Button, Popover, PopoverContent, PopoverTrigger } from '@seta/shared-ui';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface Props {
  from?: string;
  to?: string;
  onChange: (next: { from?: string; to?: string }) => void;
}

export function ChartRangeControl({ from, to, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const active = Boolean(from || to);
  const summary = active ? `${from ?? '…'} → ${to ?? '…'}` : 'Range';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={`h-7 gap-1.5 ${active ? 'border-primary text-ink' : ''}`}
          aria-label="Date range filter"
        >
          <CalendarDays className="size-3.5 opacity-70" />
          <span className="font-medium">{summary}</span>
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink-subtle">
            From
            <input
              type="date"
              value={from ?? ''}
              onChange={(e) => onChange({ from: e.target.value || undefined, to })}
              className="rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-subtle">
            To
            <input
              type="date"
              value={to ?? ''}
              onChange={(e) => onChange({ from, to: e.target.value || undefined })}
              className="rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink"
            />
          </label>
          {active && (
            <button
              type="button"
              className="self-start text-xs text-ink-subtle hover:text-ink"
              onClick={() => onChange({ from: undefined, to: undefined })}
            >
              Clear range
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
