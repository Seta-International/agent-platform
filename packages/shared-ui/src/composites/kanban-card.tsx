import { Text } from '@astryxdesign/core/Text';
import * as stylex from '@stylexjs/stylex';
import { Calendar, CheckSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { PRIORITY_BY_LEVEL } from '../lib/priority';
import { AvatarStack } from './avatar-stack';
import { KanbanCardShell, type KanbanCardShellProps } from './kanban-card-shell';
import { LabelChip } from './label-chip';
import { SyncBadge, type SyncState } from './sync-badge';

// Mirrors priority-icon.tsx's LABEL map — the pill needs an accessible label since
// color alone isn't sufficient.
const LABEL: Record<KanbanCardTask['priority'], string> = {
  urgent: 'Urgent priority',
  important: 'Important priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

const styles = stylex.create({
  title: { display: 'flex', alignItems: 'center', gap: 6 },
  completedTitle: { textDecoration: 'line-through', opacity: 0.5 },
  blockedDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--color-error)',
    flexShrink: 0,
    display: 'inline-block',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '1px 8px',
    borderRadius: 999,
    fontSize: 'var(--font-size-xs)',
    fontWeight: 600,
  },
  doneMarker: {
    marginInlineStart: 'auto',
    color: 'var(--color-success)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 600,
  },
  due: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    color: 'var(--color-text-secondary)',
    fontSize: 'var(--font-size-xs)',
    whiteSpace: 'nowrap',
  },
  dueIcon: { width: 12, height: 12, flexShrink: 0 },
  checklistChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '1px 6px',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
    background: 'var(--color-background-surface)',
    borderRadius: 999,
    fontSize: 'var(--font-size-xs)',
  },
  checklistChipComplete: {
    color: 'var(--color-success)',
    background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
  },
  syncBadge: { position: 'absolute', right: 8, top: 8 },
  checkIcon: { width: 12, height: 12 },
});

export interface KanbanCardTask {
  id: string;
  title: string;
  priority: 'urgent' | 'important' | 'medium' | 'low';
  /** Short start-date label shown on the card. Pair with `due_label` for a range. */
  start_label?: string;
  due_label?: string;
  label?: { name: string; color?: string };
  assignees: Array<{ user_id: string; display_name: string }>;
  recentlyMoved?: boolean;
  saving?: boolean;
  blocked?: boolean;
  external_source?: 'native' | 'm365';
  sync_status?: SyncState | null;
  external_synced_at?: string | null;
  /** Compact checklist progress shown on the card meta row when total > 0. */
  checklist_summary?: { total: number; checked: number };
  isCompleted?: boolean;
}

export interface KanbanCardProps {
  task: KanbanCardTask;
  onOpen?: () => void;
  selected?: boolean;
  /** Optional body content rendered between the title and the meta footer. */
  previewSlot?: ReactNode;
  /** Render slots fed by the app layer's @hello-pangea/dnd wiring. shared-ui stays DnD-agnostic. */
  draggable: KanbanCardShellProps['draggable'];
}

export function KanbanCard({ task, onOpen, selected, previewSlot, draggable }: KanbanCardProps) {
  const p = PRIORITY_BY_LEVEL[task.priority];
  const header = (
    <div {...stylex.props(styles.title)}>
      <span
        role="img"
        aria-label={LABEL[task.priority]}
        {...stylex.props(styles.pill)}
        style={{ background: p.tint, color: p.ink }}
      >
        <span aria-hidden {...stylex.props(styles.blockedDot)} style={{ background: p.color }} />
        {p.label}
      </span>
      {task.blocked && (
        <span role="img" aria-label="Blocked" {...stylex.props(styles.blockedDot)} />
      )}
      {task.isCompleted && <span {...stylex.props(styles.doneMarker)}>✓ Done</span>}
    </div>
  );
  const hasFooterContent = Boolean(
    task.label ||
      task.start_label ||
      task.due_label ||
      (task.checklist_summary && task.checklist_summary.total > 0) ||
      task.assignees.length > 0,
  );
  const footer = hasFooterContent ? (
    <>
      {task.label && <LabelChip name={task.label.name} color={task.label.color} />}
      {(task.due_label || task.start_label) && (
        <span {...stylex.props(styles.due)}>
          <Calendar aria-hidden {...stylex.props(styles.dueIcon)} />
          {task.due_label ?? task.start_label}
        </span>
      )}
      {task.checklist_summary && task.checklist_summary.total > 0 && (
        <ChecklistChip
          total={task.checklist_summary.total}
          checked={task.checklist_summary.checked}
        />
      )}
      <AvatarStack assignees={task.assignees} />
    </>
  ) : undefined;
  return (
    <KanbanCardShell
      ariaLabel={`Task: ${task.title}`}
      onOpen={onOpen}
      selected={selected}
      recentlyMoved={task.recentlyMoved}
      saving={task.saving}
      draggable={draggable}
      header={header}
      footer={footer}
    >
      <Text size="sm" weight="medium" xstyle={task.isCompleted ? styles.completedTitle : undefined}>
        {task.title}
      </Text>
      {previewSlot}
      {task.external_source === 'm365' && (
        <span {...stylex.props(styles.syncBadge)}>
          <SyncBadge
            state={task.sync_status ?? null}
            synced_at={task.external_synced_at ?? null}
            size="mini"
          />
        </span>
      )}
    </KanbanCardShell>
  );
}

function ChecklistChip({ total, checked }: { total: number; checked: number }) {
  const complete = checked >= total;
  return (
    <span
      role="img"
      aria-label={`Checklist ${checked} of ${total} done`}
      {...stylex.props(styles.checklistChip, complete && styles.checklistChipComplete)}
    >
      <CheckSquare aria-hidden {...stylex.props(styles.checkIcon)} />
      {checked}/{total}
    </span>
  );
}
