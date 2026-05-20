interface Props {
  value: 'board' | 'grid';
  onChange: (v: 'board' | 'grid') => void;
}

export function PlanViewSwitcher({ value, onChange }: Props) {
  return (
    <div role="tablist" className="plan-view-switcher">
      <button
        type="button"
        role="tab"
        aria-selected={value === 'board'}
        onClick={() => onChange('board')}
      >
        Board
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'grid'}
        onClick={() => onChange('grid')}
      >
        Grid
      </button>
    </div>
  );
}
