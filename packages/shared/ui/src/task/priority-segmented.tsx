import type { CSSProperties } from 'react';

export interface PriorityStop {
  value: 1 | 3 | 5 | 9;
  label: 'Urgent' | 'Important' | 'Medium' | 'Low';
  color: string;
}

export const PRIORITY_STOPS: PriorityStop[] = [
  { value: 1, label: 'Urgent', color: 'var(--color-danger)' },
  { value: 3, label: 'Important', color: 'var(--color-warning)' },
  { value: 5, label: 'Medium', color: 'var(--color-info)' },
  { value: 9, label: 'Low', color: 'var(--color-ink-tertiary)' },
];

interface Props {
  value: 1 | 3 | 5 | 9;
  onChange: (next: 1 | 3 | 5 | 9) => void;
  disabled?: boolean;
}

export function PrioritySegmented({ value, onChange, disabled = false }: Props) {
  return (
    <fieldset aria-label="Priority" style={group}>
      {PRIORITY_STOPS.map((stop) => {
        const active = stop.value === value;
        return (
          <button
            key={stop.value}
            type="button"
            data-value={stop.value}
            aria-pressed={active}
            aria-label={stop.label}
            disabled={disabled}
            onClick={() => onChange(stop.value)}
            style={{
              ...stopBtn,
              ...(active ? activeBtn : {}),
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <span aria-hidden="true" style={{ ...flag, background: stop.color }} />
            <span>{stop.label}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

const group: CSSProperties = {
  display: 'inline-flex',
  gap: 2,
  padding: 2,
  border: '1px solid var(--color-hairline)',
  borderRadius: 6,
  background: 'var(--color-surface-2)',
  margin: 0,
};
const stopBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 4,
  background: 'transparent',
  border: '1px solid transparent',
  color: 'var(--color-ink-muted)',
  fontSize: 12,
  fontWeight: 500,
};
const activeBtn: CSSProperties = {
  background: 'var(--color-canvas)',
  boxShadow: 'var(--shadow-sm)',
  color: 'var(--color-ink)',
};
const flag: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 2,
  display: 'inline-block',
};
