import { Search, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function PlanSearchInput({ value, onChange, placeholder = 'Search tasks…' }: Props) {
  return (
    <div className="plan-search-input">
      <Search aria-hidden="true" className="plan-search-input__icon" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label="Search tasks in this plan"
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="plan-search-input__clear"
        >
          <X aria-hidden="true" className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
