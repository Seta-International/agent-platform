import { Button, Checkbox, Popover } from '@seta/shared-ui';
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
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      alignment="end"
      width={288}
      label="Customize charts"
      content={
        <>
          <div className="px-1 pb-2">
            <p className="text-base font-medium text-primary">Customize charts</p>
            <p className="text-xs text-secondary">
              Pick what shows on this tab. Saved to your view.
            </p>
          </div>
          <ul className="flex flex-col">
            {CHART_REGISTRY.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded px-1 py-1.5">
                <Checkbox
                  label={c.title}
                  description={c.subtitle}
                  value={visibleSet.has(c.id)}
                  isDisabled={c.disabled}
                  onChange={() => {
                    if (!c.disabled) toggle(c.id);
                  }}
                />
                {(c.default || c.disabled) && (
                  <span className="flex items-center gap-1.5">
                    {c.default && (
                      <span className="rounded border border-border px-1 text-xs uppercase tracking-wide text-secondary">
                        Default
                      </span>
                    )}
                    {c.disabled && (
                      <span className="text-xs uppercase tracking-wide text-secondary">
                        Coming soon
                      </span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <Button
              variant="ghost"
              size="sm"
              label="Reset to defaults"
              onClick={() => onChange(DEFAULT_VISIBLE)}
            />
            <Button variant="secondary" size="sm" label="Done" onClick={() => setOpen(false)} />
          </div>
        </>
      }
    >
      <Button
        variant="secondary"
        size="sm"
        icon={<Settings2 className="size-3.5 opacity-70" />}
        label={`Customize ${visible.length}/${enabledTotal}`}
      />
    </Popover>
  );
}
