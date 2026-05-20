interface Props {
  value: 'board' | 'grid';
  onChange: (v: 'board' | 'grid') => void;
  gridDisabled?: boolean;
}

export function PlanViewSwitcher({ value, onChange, gridDisabled }: Props) {
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
        aria-disabled={gridDisabled || undefined}
        onClick={() => {
          if (!gridDisabled) onChange('grid');
        }}
        title={gridDisabled ? 'Grid view ships in PR3' : undefined}
      >
        Grid
      </button>
    </div>
  );
}
