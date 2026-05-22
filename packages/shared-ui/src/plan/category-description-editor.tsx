import { type CSSProperties, useMemo, useState } from 'react';

export interface CategoryLabel {
  id: string;
  name: string;
  color: string;
  category_slot: number | null;
}

export type SlotPatch = { name?: string | null; labelId?: string | null };

export interface SavePayload {
  slots: Record<number, SlotPatch>;
}

export interface CategoryDescriptionEditorProps {
  descriptions: Record<string, string>;
  labels: ReadonlyArray<CategoryLabel>;
  // Keyed by slot number; wire format keys are digit-strings, JS coerces lookups either way.
  taskCounts: Record<string, number>;
  onSave: (payload: SavePayload) => void;
  disabled?: boolean;
}

const TOTAL_SLOTS = 25;
const DEFAULT_VISIBLE = 10;

export function CategoryDescriptionEditor({
  descriptions,
  labels,
  taskCounts,
  onSave,
  disabled,
}: CategoryDescriptionEditorProps) {
  const initialAttached = useMemo(() => {
    const m = new Map<number, string>();
    for (const l of labels) {
      if (l.category_slot != null) m.set(l.category_slot, l.id);
    }
    return m;
  }, [labels]);

  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<Record<number, SlotPatch>>({});
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  const visibleCount = expanded ? TOTAL_SLOTS : DEFAULT_VISIBLE;
  const slots = Array.from({ length: visibleCount }, (_, i) => i + 1);

  const currentName = (n: number): string => {
    const patch = pending[n];
    if (patch && 'name' in patch) return patch.name ?? '';
    return descriptions[`category${n}`] ?? '';
  };

  const currentLabelId = (n: number): string | null => {
    const patch = pending[n];
    if (patch && 'labelId' in patch) return patch.labelId ?? null;
    return initialAttached.get(n) ?? null;
  };

  const labelById = (id: string | null): CategoryLabel | undefined => {
    if (!id) return undefined;
    return labels.find((l) => l.id === id);
  };

  const setName = (n: number, value: string) => {
    const hadExisting = (descriptions[`category${n}`] ?? '').length > 0;
    const next: string | null = value.trim() === '' && hadExisting ? null : value;
    setPending((p) => ({ ...p, [n]: { ...p[n], name: next } }));
  };

  const setLabel = (n: number, labelId: string | null) => {
    setPending((p) => ({ ...p, [n]: { ...p[n], labelId } }));
    setPickerSlot(null);
  };

  const filledCount = useMemo(() => {
    let c = 0;
    for (let i = 1; i <= TOTAL_SLOTS; i++) {
      if ((descriptions[`category${i}`] ?? '').trim()) c++;
    }
    return c;
  }, [descriptions]);

  const handleSave = () => {
    onSave({ slots: pending });
  };

  return (
    <div style={shell}>
      <div style={header}>
        <div>
          <h2 style={headTitle}>Category slots</h2>
          <p style={headDesc}>
            Up to {TOTAL_SLOTS} named buckets-by-category, in addition to Seta labels. Each slot can
            name itself (e.g. "Bug") and optionally attach to a Seta label so tasks tagged with that
            label show in that category column.
          </p>
        </div>
        <div style={headRight}>
          <span className="t-sm subtle">
            {filledCount} / {TOTAL_SLOTS}
          </span>
          {!disabled && (
            <button type="button" style={primaryBtn} onClick={handleSave}>
              Save changes
            </button>
          )}
        </div>
      </div>

      <div style={tableShell}>
        <div style={tableHead}>
          <span>Slot</span>
          <span>Category description</span>
          <span>Attached Seta label</span>
          <span style={{ textAlign: 'right' }}>Tasks</span>
        </div>

        {slots.map((n) => {
          const name = currentName(n);
          const lid = currentLabelId(n);
          const attached = labelById(lid);
          const count = taskCounts[n];
          const isLast = n === slots[slots.length - 1];
          const empty = !name.trim();
          return (
            <div key={n} style={rowGrid(isLast, empty)}>
              <span style={slotBadge} className="mono">
                cat {n}
              </span>
              <div style={inputWrap(empty)}>
                <input
                  type="text"
                  aria-label={`Slot ${n} description`}
                  value={name}
                  placeholder={empty ? 'Add a category description…' : ''}
                  disabled={disabled}
                  onChange={(e) => setName(n, e.target.value)}
                  style={inputEl(empty)}
                />
              </div>
              <div style={labelCell}>
                {attached ? (
                  <button
                    type="button"
                    aria-label={`Slot ${n} change label`}
                    disabled={disabled}
                    onClick={() => setPickerSlot(pickerSlot === n ? null : n)}
                    style={labelButton}
                  >
                    <span style={labelButtonLeft}>
                      <span
                        aria-hidden="true"
                        className="dot"
                        style={{ background: attached.color }}
                      />
                      {attached.name}
                    </span>
                    <span aria-hidden="true" style={chevronStyle}>
                      ▾
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label={`Slot ${n} attach label`}
                    disabled={disabled}
                    onClick={() => setPickerSlot(pickerSlot === n ? null : n)}
                    style={attachButton}
                  >
                    <span aria-hidden="true">+</span> Attach a label
                  </button>
                )}
                {pickerSlot === n && (
                  <LabelPicker
                    labels={labels}
                    selectedId={lid}
                    onPick={(id) => setLabel(n, id)}
                    onClear={() => setLabel(n, null)}
                  />
                )}
              </div>
              <span style={countCell(count != null && count > 0)} className="mono t-sm">
                {count != null && count > 0 ? count : '—'}
              </span>
            </div>
          );
        })}

        <div style={tableFoot}>
          {expanded ? (
            <button type="button" style={ghostBtn} onClick={() => setExpanded(false)}>
              Show {DEFAULT_VISIBLE}
            </button>
          ) : (
            <>
              <span className="t-sm subtle">
                {TOTAL_SLOTS - DEFAULT_VISIBLE} more empty slots ·{' '}
              </span>
              <button type="button" style={ghostBtn} onClick={() => setExpanded(true)}>
                Show all {TOTAL_SLOTS}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface LabelPickerProps {
  labels: ReadonlyArray<CategoryLabel>;
  selectedId: string | null;
  onPick: (id: string) => void;
  onClear: () => void;
}

function LabelPicker({ labels, selectedId, onPick, onClear }: LabelPickerProps) {
  return (
    <div role="listbox" aria-label="Pick label" style={pickerStyle}>
      {labels.map((l) => (
        <button
          key={l.id}
          type="button"
          role="option"
          aria-selected={selectedId === l.id}
          onClick={() => onPick(l.id)}
          style={pickerOption}
        >
          <span aria-hidden="true" className="dot" style={{ background: l.color }} />
          {l.name}
        </button>
      ))}
      {selectedId && (
        <button type="button" onClick={onClear} style={pickerClear}>
          Clear
        </button>
      )}
    </div>
  );
}

const shell: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};
const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: 20,
  background: 'var(--color-surface-1)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 8,
};
const headTitle: CSSProperties = { margin: '0 0 4px', fontSize: 16, fontWeight: 600 };
const headDesc: CSSProperties = {
  margin: 0,
  maxWidth: 600,
  fontSize: 13,
  color: 'var(--color-ink-muted)',
};
const headRight: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };
const primaryBtn: CSSProperties = {
  background: 'var(--color-primary)',
  color: '#fff',
  border: '1px solid var(--color-primary)',
  padding: '6px 12px',
  borderRadius: 4,
  fontSize: 13,
  cursor: 'pointer',
};
const tableShell: CSSProperties = {
  background: 'var(--color-surface-1)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 8,
  overflow: 'hidden',
};
const tableHead: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '60px 1.4fr 1.4fr 110px',
  padding: '10px 18px',
  background: 'var(--color-surface-1)',
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--color-ink-subtle)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid var(--color-hairline)',
  gap: 12,
};
const rowGrid = (last: boolean, empty: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: '60px 1.4fr 1.4fr 110px',
  padding: '10px 18px',
  gap: 12,
  alignItems: 'center',
  borderBottom: last ? '0' : '1px solid var(--color-hairline-tertiary)',
  background: empty ? 'var(--color-surface-1)' : 'transparent',
  position: 'relative',
});
const slotBadge: CSSProperties = {
  fontSize: 12,
  padding: '3px 8px',
  borderRadius: 4,
  background: 'var(--color-surface-2)',
  color: 'var(--color-ink-muted)',
  justifySelf: 'flex-start',
};
const inputWrap = (empty: boolean): CSSProperties => ({
  height: 30,
  display: 'flex',
  alignItems: 'center',
  border: `1px solid ${empty ? 'var(--color-hairline)' : 'var(--color-hairline-strong)'}`,
  background: empty ? 'transparent' : 'var(--color-canvas)',
  borderRadius: 4,
  padding: '0 8px',
});
const inputEl = (empty: boolean): CSSProperties => ({
  width: '100%',
  border: 0,
  background: 'transparent',
  outline: 'none',
  fontSize: 13,
  color: empty ? 'var(--color-ink-subtle)' : 'var(--color-ink)',
});
const labelButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '5px 10px',
  borderRadius: 6,
  height: 30,
  background: 'var(--color-surface-1)',
  border: '1px solid var(--color-hairline)',
  fontSize: 13,
  cursor: 'pointer',
  color: 'var(--color-ink)',
};
const labelButtonLeft: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};
const chevronStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--color-ink-subtle)',
};
const attachButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  borderRadius: 6,
  height: 30,
  background: 'transparent',
  border: '1px dashed var(--color-hairline-strong)',
  fontSize: 13,
  color: 'var(--color-ink-subtle)',
  cursor: 'pointer',
};
const countCell = (hasCount: boolean): CSSProperties => ({
  textAlign: 'right',
  color: hasCount ? 'var(--color-ink)' : 'var(--color-ink-tertiary)',
});
const tableFoot: CSSProperties = {
  padding: '12px 18px',
  borderTop: '1px solid var(--color-hairline-tertiary)',
  background: 'var(--color-surface-1)',
  textAlign: 'center',
};
const ghostBtn: CSSProperties = {
  background: 'transparent',
  border: 0,
  color: 'var(--color-ink)',
  fontSize: 13,
  cursor: 'pointer',
  padding: '0 6px',
  height: 22,
};
const labelCell: CSSProperties = {
  position: 'relative',
};
const pickerStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 2px)',
  left: 0,
  width: '100%',
  zIndex: 10,
  background: 'var(--color-canvas)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 6,
  boxShadow: 'var(--shadow-md)',
  padding: 4,
  minWidth: 180,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
const pickerOption: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  border: 0,
  background: 'transparent',
  fontSize: 13,
  cursor: 'pointer',
  textAlign: 'left',
  borderRadius: 4,
  color: 'var(--color-ink)',
};
const pickerClear: CSSProperties = {
  ...pickerOption,
  color: 'var(--color-ink-subtle)',
  borderTop: '1px solid var(--color-hairline-tertiary)',
  marginTop: 2,
};
