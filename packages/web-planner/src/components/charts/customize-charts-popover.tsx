import { Button, Checkbox, Popover, PopoverContent, PopoverTrigger } from '@seta/shared-ui';
import { Settings2 } from 'lucide-react';
import { useState } from 'react';
import { CHART_REGISTRY, type ChartId, DEFAULT_VISIBLE } from './chart-registry';

interface Props {
  visible: ChartId[];
  onChange: (next: ChartId[]) => void;
}

export function CustomizeChartsPopover({ visible, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const visibleSet = new Set(visible);
  const enabledTotal = CHART_REGISTRY.filter((c) => !c.disabled).length;

  function toggle(id: ChartId) {
    onChange(visibleSet.has(id) ? visible.filter((x) => x !== id) : [...visible, id]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="h-7 gap-1.5" aria-label="Customize charts">
          <Settings2 className="size-3.5 opacity-70" />
          <span className="font-medium">Customize</span>
          <span className="text-ink-subtle">
            {visible.length}/{enabledTotal}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="px-1 pb-2">
          <p className="text-body-sm font-medium text-ink">Customize charts</p>
          <p className="text-xs text-ink-subtle">
            Pick what shows on this tab. Saved to your view.
          </p>
        </div>
        <ul className="flex flex-col">
          {CHART_REGISTRY.map((c) => (
            <li key={c.id}>
              <label
                htmlFor={`chart-toggle-${c.id}`}
                className={`flex items-start gap-2 rounded px-1 py-1.5 ${
                  c.disabled ? 'opacity-50' : 'cursor-pointer hover:bg-surface-2'
                }`}
              >
                <Checkbox
                  id={`chart-toggle-${c.id}`}
                  className="mt-0.5"
                  checked={visibleSet.has(c.id)}
                  disabled={c.disabled}
                  onCheckedChange={() => {
                    if (!c.disabled) toggle(c.id);
                  }}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm text-ink">
                    {c.title}
                    {c.default && (
                      <span className="rounded border border-hairline px-1 text-[10px] uppercase tracking-wide text-ink-subtle">
                        Default
                      </span>
                    )}
                    {c.disabled && (
                      <span className="text-[10px] uppercase tracking-wide text-ink-subtle">
                        Coming soon
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-ink-subtle">{c.subtitle}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2">
          <button
            type="button"
            className="text-xs text-ink-subtle hover:text-ink"
            onClick={() => onChange(DEFAULT_VISIBLE)}
          >
            Reset to defaults
          </button>
          <Button variant="secondary" size="sm" className="h-7" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
