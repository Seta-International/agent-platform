import type { CSSProperties } from 'react';

interface Props {
  kind: 'Start' | 'Due';
  value: string | null;
  onChange: (next: string | null) => void;
  overdue?: boolean;
  suffix?: string;
  clearable?: boolean;
}

export function DatePill({ kind, value, onChange, overdue = false, suffix, clearable }: Props) {
  return (
    <span
      data-overdue={overdue ? 'true' : undefined}
      style={{
        ...pill,
        borderColor: overdue ? 'var(--color-danger)' : 'var(--color-hairline)',
        color: overdue ? 'var(--color-danger-ink)' : 'var(--color-ink)',
      }}
    >
      <span
        aria-hidden="true"
        style={{ ...glyph, color: overdue ? 'var(--color-danger)' : 'var(--color-ink-subtle)' }}
      >
        ◷
      </span>
      <span style={kindLabel}>{kind}</span>
      <input
        type="date"
        className="mono"
        value={value ?? ''}
        onChange={(e) => onChange(e.currentTarget.value || null)}
        style={dateInput}
        aria-label={kind}
      />
      {suffix && <span className="t-xs subtle">{suffix}</span>}
      {clearable && value && (
        <button type="button" onClick={() => onChange(null)} aria-label="Clear" style={clearBtn}>
          ×
        </button>
      )}
    </span>
  );
}

const pill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid var(--color-hairline)',
  background: 'var(--color-surface-1)',
  fontSize: 12,
};
const glyph: CSSProperties = { fontSize: 13, lineHeight: 1 };
const kindLabel: CSSProperties = {
  fontWeight: 600,
  color: 'var(--color-ink-subtle)',
  letterSpacing: 0.2,
};
const dateInput: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  padding: 0,
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
};
const clearBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--color-ink-subtle)',
  cursor: 'pointer',
  padding: '0 2px',
  fontSize: 14,
  lineHeight: 1,
};
