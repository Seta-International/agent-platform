import type { CSSProperties } from 'react';

export type PreviewType = 'automatic' | 'noPreview' | 'checklist' | 'description' | 'reference';

export interface PreviewTypeOption {
  value: PreviewType;
  label: string;
  desc: string;
}

export const PREVIEW_TYPES: PreviewTypeOption[] = [
  { value: 'automatic', label: 'Automatic', desc: 'Best of below' },
  { value: 'noPreview', label: 'None', desc: 'Title only' },
  { value: 'checklist', label: 'Checklist', desc: 'First 3 items' },
  { value: 'description', label: 'Description', desc: '2-line excerpt' },
  { value: 'reference', label: 'Reference', desc: 'Top link host' },
];

interface Props {
  value: PreviewType;
  onChange: (next: PreviewType) => void;
}

export function PreviewTypeRadio({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Preview type" style={group}>
      {PREVIEW_TYPES.map((opt) => {
        const active = opt.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: button-with-role pattern preserves the two-line label+desc layout that a native <input type="radio"> cannot express.
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            onClick={() => onChange(opt.value)}
            style={{ ...optBtn, ...(active ? activeOpt : {}) }}
          >
            <span style={{ fontWeight: 600, fontSize: 12 }}>{opt.label}</span>
            <span className="t-xs subtle">{opt.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

const group: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
};
const optBtn: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
  padding: '8px 10px',
  borderRadius: 6,
  background: 'var(--color-surface-1)',
  border: '1px solid var(--color-hairline)',
  color: 'var(--color-ink)',
  cursor: 'pointer',
  textAlign: 'left',
  minWidth: 110,
};
const activeOpt: CSSProperties = {
  background: 'var(--color-primary-tint)',
  borderColor: 'var(--color-primary-border)',
  boxShadow: '0 0 0 3px var(--color-primary-tint)',
};
