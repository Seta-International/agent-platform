import type { CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import { AvatarStack } from '../composites/avatar-stack';
import { LabelChip } from '../composites/label-chip';
import { PriorityIcon } from '../composites/priority-icon';
import { REFERENCE_TYPE_COLOR, type ReferenceType } from '../task/reference-row';

export type PreviewVariant = 'automatic' | 'noPreview' | 'checklist' | 'description' | 'reference';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface PreviewReference {
  id: string;
  type: ReferenceType;
  alias: string | null;
  host: string;
}

export interface PreviewCardTask {
  id: string;
  title: string;
  description?: string;
  checklist?: ReadonlyArray<ChecklistItem>;
  references?: ReadonlyArray<PreviewReference>;
  priority: 'urgent' | 'important' | 'medium' | 'low';
  labels?: ReadonlyArray<{ name: string; color?: string }>;
  assignees?: ReadonlyArray<{ user_id: string; display_name: string }>;
  due_at?: string;
}

export interface PreviewCardProps {
  task: PreviewCardTask;
  variant: PreviewVariant;
}

export interface PreviewBodyTask {
  description?: string;
  checklist?: ReadonlyArray<ChecklistItem>;
  references?: ReadonlyArray<PreviewReference>;
}

export interface PreviewBodyProps {
  task: PreviewBodyTask;
  variant: PreviewVariant;
}

type PickedSource = 'references' | 'description' | 'checklist';

export function PreviewCard({ task, variant }: PreviewCardProps) {
  return (
    <div style={cardShell}>
      <div style={titleStyle}>{task.title}</div>
      <PreviewBody task={task} variant={variant} />
      <Footer task={task} />
    </div>
  );
}

export function PreviewBody({ task, variant }: PreviewBodyProps) {
  if (variant === 'noPreview') return null;

  if (variant === 'automatic') {
    const picked = pickAutomaticSource(task);
    if (!picked) return null;
    return (
      <div data-role="preview-body" style={bodyWrap}>
        {bodyForSource(task, picked)}
        <div className="t-xs subtle" style={attributionStyle}>
          picked from {picked}
        </div>
      </div>
    );
  }

  const content = bodyForSource(task, variantToSource(variant));
  if (!content) return null;
  return (
    <div data-role="preview-body" style={bodyWrap}>
      {content}
    </div>
  );
}

function variantToSource(
  variant: Exclude<PreviewVariant, 'automatic' | 'noPreview'>,
): PickedSource {
  if (variant === 'description') return 'description';
  if (variant === 'checklist') return 'checklist';
  return 'references';
}

function pickAutomaticSource(task: PreviewBodyTask): PickedSource | null {
  if (task.references && task.references.length > 0) return 'references';
  if (task.description && task.description.trim().length > 0) return 'description';
  if (task.checklist && task.checklist.length > 0) return 'checklist';
  return null;
}

function bodyForSource(task: PreviewBodyTask, source: PickedSource) {
  if (source === 'references') {
    const ref = task.references?.[0];
    if (!ref) return null;
    return <ReferenceBody refRow={ref} />;
  }
  if (source === 'description') {
    const desc = task.description ?? '';
    if (!desc.trim()) return null;
    return <DescriptionBody markdown={desc} />;
  }
  const items = task.checklist ?? [];
  if (items.length === 0) return null;
  return <ChecklistBody items={items} />;
}

function ReferenceBody({ refRow }: { refRow: PreviewReference }) {
  const color = REFERENCE_TYPE_COLOR[refRow.type] ?? 'var(--color-info)';
  return (
    <div style={refBoxStyle}>
      <span aria-hidden="true" style={{ ...refDotStyle, background: color }} />
      <span style={refAliasStyle}>{refRow.alias ?? refRow.host}</span>
      <span className="mono t-xs subtle">{stripTld(refRow.host)}</span>
    </div>
  );
}

function stripTld(host: string): string {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(0, -1).join('.');
}

function DescriptionBody({ markdown }: { markdown: string }) {
  return (
    <div style={descClampStyle}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <span>{children}</span>,
          a: ({ children }) => <span>{children}</span>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function ChecklistBody({ items }: { items: ReadonlyArray<ChecklistItem> }) {
  const shown = items.slice(0, 3);
  const doneCount = items.filter((c) => c.done).length;
  return (
    <div style={checklistBoxStyle}>
      {shown.map((c) => (
        <div key={c.id} style={checklistRowStyle}>
          <span aria-hidden="true" style={c.done ? checklistDoneSquare : checklistEmptySquare} />
          <span style={c.done ? checklistTextDone : checklistText}>{c.text}</span>
        </div>
      ))}
      <div className="t-xs subtle" style={{ marginTop: 2 }}>
        {doneCount} of {items.length}
      </div>
    </div>
  );
}

function Footer({ task }: { task: PreviewCardTask }) {
  const label = task.labels?.[0];
  const due = task.due_at ? formatDay(task.due_at) : null;
  return (
    <div style={footerStyle}>
      <div style={footerLeft}>
        <PriorityIcon level={task.priority} />
        {label && <LabelChip name={label.name} color={label.color} />}
        {due && <span className="t-xs subtle">{due}</span>}
      </div>
      <AvatarStack assignees={task.assignees ?? []} max={2} />
    </div>
  );
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

const cardShell: CSSProperties = {
  background: 'var(--color-canvas)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 6,
  padding: '10px 12px',
  boxShadow: 'var(--shadow-sm)',
  display: 'flex',
  flexDirection: 'column',
};
const titleStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.35,
  fontWeight: 500,
  marginBottom: 8,
};
const bodyWrap: CSSProperties = { display: 'flex', flexDirection: 'column' };
const attributionStyle: CSSProperties = { marginTop: 5, fontStyle: 'italic' };
const refBoxStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  background: 'var(--color-surface-1)',
  borderRadius: 4,
  border: '1px solid var(--color-hairline-tertiary)',
  fontSize: 11.5,
};
const refDotStyle: CSSProperties = {
  width: 11,
  height: 11,
  borderRadius: 3,
  flexShrink: 0,
};
const refAliasStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontWeight: 500,
};
const descClampStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--color-ink-muted)',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};
const checklistBoxStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '6px 8px',
  background: 'var(--color-surface-1)',
  borderRadius: 4,
  border: '1px solid var(--color-hairline-tertiary)',
};
const checklistRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11.5,
};
const checklistDoneSquare: CSSProperties = {
  width: 11,
  height: 11,
  borderRadius: 3,
  background: 'var(--color-success)',
  display: 'inline-block',
  flexShrink: 0,
};
const checklistEmptySquare: CSSProperties = {
  width: 11,
  height: 11,
  borderRadius: 3,
  border: '1px solid var(--color-hairline-strong)',
  display: 'inline-block',
  flexShrink: 0,
};
const checklistText: CSSProperties = {
  color: 'var(--color-ink)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const checklistTextDone: CSSProperties = {
  ...checklistText,
  color: 'var(--color-ink-subtle)',
  textDecoration: 'line-through',
};
const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 10,
};
const footerLeft: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};
