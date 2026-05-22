import * as Slider from '@radix-ui/react-slider';
import type { CSSProperties } from 'react';

interface Props {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}

const TICKS = [0, 25, 50, 75, 100];

export function ProgressSlider({ value, onChange, disabled = false }: Props) {
  const status = value === 0 ? 'Not started' : value === 100 ? 'Done' : 'In Progress';
  const dotClass = value === 0 ? 'dot--muted' : value === 100 ? 'dot--success' : 'dot--primary';
  return (
    <div>
      <div style={row}>
        <Slider.Root
          value={[value]}
          onValueChange={(v) => onChange(v[0] ?? 0)}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          style={{
            position: 'relative',
            flex: 1,
            height: 16,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Slider.Track style={track}>
            <Slider.Range style={range} />
          </Slider.Track>
          {TICKS.map((t) => (
            <span key={t} data-tick style={{ ...tick, left: `calc(${t}% - 1px)` }} />
          ))}
          <Slider.Thumb aria-label="Percent complete" style={thumb} />
        </Slider.Root>
        <span className="mono" style={valueLabel}>
          {value}
          <span className="subtle" style={{ fontWeight: 400 }}>
            %
          </span>
        </span>
      </div>
      <div style={statusRow}>
        <span className={`dot ${dotClass}`} />
        snaps to <span style={{ color: 'var(--color-ink)' }}>{status}</span>
      </div>
    </div>
  );
}

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 };
const track: CSSProperties = {
  position: 'relative',
  height: 4,
  width: '100%',
  background: 'var(--color-surface-2)',
  borderRadius: 999,
};
const range: CSSProperties = {
  position: 'absolute',
  height: '100%',
  background: 'var(--color-primary)',
  borderRadius: 999,
};
const thumb: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: 999,
  background: 'var(--color-canvas)',
  border: '1.5px solid var(--color-primary)',
  boxShadow: 'var(--shadow-sm)',
  display: 'block',
  cursor: 'grab',
  outline: 'none',
};
const tick: CSSProperties = {
  position: 'absolute',
  top: 7,
  width: 2,
  height: 2,
  borderRadius: 999,
  background: 'var(--color-ink-tertiary)',
};
const valueLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  minWidth: 34,
  textAlign: 'right',
};
const statusRow: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 8,
  fontSize: 11.5,
  color: 'var(--color-ink-subtle)',
};
