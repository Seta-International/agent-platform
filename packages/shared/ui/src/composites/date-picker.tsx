import { CalendarIcon, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { Calendar } from '../primitives/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';

export interface DatePickerProps {
  value: Date | null;
  onChange: (next: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  quickPicks?: ReadonlyArray<{ label: string; days: number }>;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  format?: (d: Date) => string;
}

const DEFAULT_QUICK_PICKS = [
  { label: 'Tomorrow', days: 1 },
  { label: '+3 days', days: 3 },
  { label: '+1 week', days: 7 },
  { label: '+2 weeks', days: 14 },
] as const;

function defaultFormat(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Pick a date',
  quickPicks = DEFAULT_QUICK_PICKS,
  clearable = false,
  disabled = false,
  className,
  id,
  format = defaultFormat,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const today = startOfDay(new Date());

  function selectDate(d: Date | null) {
    onChange(d);
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="secondary"
            disabled={disabled}
            className={cn(
              'h-9 min-w-[14rem] justify-start text-left font-normal',
              value == null && 'text-ink-muted',
              className,
            )}
            aria-label={value ? `Selected ${format(value)}` : placeholder}
          >
            <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
            <span className="flex-1 truncate">{value ? format(value) : placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          {quickPicks.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {quickPicks.map((q) => (
                <Button
                  key={q.label}
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => selectDate(addDays(today, q.days))}
                >
                  {q.label}
                </Button>
              ))}
            </div>
          )}
          <Calendar
            mode="single"
            selected={value ?? undefined}
            onSelect={(d) => selectDate(d ?? null)}
            disabled={(d) => {
              if (minDate && d < startOfDay(minDate)) return true;
              if (maxDate && d > startOfDay(maxDate)) return true;
              return false;
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && value && (
        <Button size="icon" variant="ghost" aria-label="Clear date" onClick={() => onChange(null)}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
