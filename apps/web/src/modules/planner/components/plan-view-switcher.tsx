import { CalendarDays, LayoutGrid, Rows3 } from 'lucide-react';
import type { ViewMode } from '../state/url-state';

interface Props {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}

export function PlanViewSwitcher({ value, onChange }: Props) {
  return (
    <div className="plan-view-switcher">
      <button
        type="button"
        aria-pressed={value === 'board'}
        aria-label="Board view"
        onClick={() => onChange('board')}
      >
        <LayoutGrid aria-hidden="true" className="size-3.5" />
        <span>Board</span>
      </button>
      <button
        type="button"
        aria-pressed={value === 'grid'}
        aria-label="Grid view"
        onClick={() => onChange('grid')}
      >
        <Rows3 aria-hidden="true" className="size-3.5" />
        <span>Grid</span>
      </button>
      <button
        type="button"
        aria-pressed={value === 'calendar'}
        aria-label="Calendar view"
        onClick={() => onChange('calendar')}
      >
        <CalendarDays aria-hidden="true" className="size-3.5" />
        <span>Calendar</span>
      </button>
    </div>
  );
}
