import { LayoutGrid, Rows3 } from 'lucide-react';

interface Props {
  value: 'board' | 'grid';
  onChange: (v: 'board' | 'grid') => void;
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
        <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
        <span>Board</span>
      </button>
      <button
        type="button"
        aria-pressed={value === 'grid'}
        aria-label="Grid view"
        onClick={() => onChange('grid')}
      >
        <Rows3 aria-hidden="true" className="h-3.5 w-3.5" />
        <span>Grid</span>
      </button>
    </div>
  );
}
