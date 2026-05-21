import type { ButtonHTMLAttributes, CSSProperties } from 'react';

export type ReferenceType =
  | 'word'
  | 'excel'
  | 'powerPoint'
  | 'visio'
  | 'powerBI'
  | 'oneNote'
  | 'sharePoint'
  | 'web'
  | 'link'
  | 'other';

export const REFERENCE_TYPE_COLOR: Record<ReferenceType, string> = {
  word: '#2b579a',
  excel: '#1f8a4c',
  powerPoint: '#d24726',
  visio: '#3955a3',
  powerBI: '#f2c811',
  oneNote: '#80397b',
  sharePoint: '#0078d4',
  web: 'var(--color-info)',
  link: 'var(--color-ink-muted)',
  other: 'var(--color-ink-muted)',
};

export interface ReferenceRowData {
  id: string;
  url: string;
  alias: string | null;
  host: string;
  type: ReferenceType;
}

interface Props {
  refRow: ReferenceRowData;
  onOpen: (row: ReferenceRowData) => void;
  onRemove: (row: ReferenceRowData) => void;
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
}

export function ReferenceRow({ refRow, onOpen, onRemove, dragHandleProps }: Props) {
  const color = REFERENCE_TYPE_COLOR[refRow.type];
  const displayName = refRow.alias ?? refRow.host;
  return (
    <div style={row}>
      <button type="button" {...dragHandleProps} aria-label="Drag" style={dragHandle}>
        ⋮⋮
      </button>
      <span aria-hidden="true" style={{ ...iconSquare, background: color }}>
        {refRow.type.charAt(0).toUpperCase()}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={alias}>{displayName}</span>
        {displayName !== refRow.host && <span className="t-xs subtle">{refRow.host}</span>}
      </div>
      <span style={typeBadge}>{refRow.type}</span>
      <button type="button" onClick={() => onOpen(refRow)} aria-label="Open" style={iconBtn}>
        ↗
      </button>
      <button type="button" onClick={() => onRemove(refRow)} aria-label="Remove" style={iconBtn}>
        ×
      </button>
    </div>
  );
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  border: '1px solid var(--color-hairline)',
  borderRadius: 6,
  background: 'var(--color-surface-1)',
};
const dragHandle: CSSProperties = {
  cursor: 'grab',
  color: 'var(--color-ink-tertiary)',
  fontSize: 12,
  lineHeight: 1,
  userSelect: 'none',
  background: 'transparent',
  border: 'none',
  padding: '2px 4px',
};
const iconSquare: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 4,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
};
const alias: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--color-ink)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const typeBadge: CSSProperties = {
  fontSize: 10,
  padding: '2px 6px',
  borderRadius: 4,
  background: 'var(--color-surface-2)',
  color: 'var(--color-ink-subtle)',
  textTransform: 'lowercase',
};
const iconBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--color-ink-subtle)',
  cursor: 'pointer',
  fontSize: 13,
  padding: '2px 4px',
  lineHeight: 1,
};
