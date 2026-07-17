import { Button, DateInput, Popover } from '@seta/shared-ui';
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
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      alignment="end"
      width={256}
      label="Date range"
      content={
        <div className="flex flex-col gap-3">
          <DateInput
            label="From"
            size="sm"
            value={from}
            onChange={(v) => onChange({ from: v, to })}
          />
          <DateInput label="To" size="sm" value={to} onChange={(v) => onChange({ from, to: v })} />
          {active && (
            <Button
              variant="ghost"
              size="sm"
              label="Clear range"
              onClick={() => onChange({ from: undefined, to: undefined })}
              className="self-start"
            />
          )}
        </div>
      }
    >
      <Button
        variant="secondary"
        size="sm"
        className={`h-7 gap-1.5 ${active ? 'border-accent-bg text-primary' : ''}`}
        label="Date range filter"
        icon={<CalendarDays className="size-3.5 opacity-70" />}
        endContent={<ChevronDown className="size-3 opacity-60" />}
      >
        <span className="font-medium">{summary}</span>
      </Button>
    </Popover>
  );
}
