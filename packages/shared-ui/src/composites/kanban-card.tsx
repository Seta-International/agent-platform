import { Text } from '@astryxdesign/core/Text';
import * as stylex from '@stylexjs/stylex';
import { CheckSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { AvatarStack } from './avatar-stack';
import { KanbanCardShell, type KanbanCardShellProps } from './kanban-card-shell';
import { LabelChip } from './label-chip';
import { PriorityIcon } from './priority-icon';
import { SyncBadge, type SyncState } from './sync-badge';

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
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-1)',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-secondary)',
  },
  due: { color: 'var(--color-text-secondary)' },
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
  return (
    <KanbanCardShell
      ariaLabel={`Task: ${task.title}`}
      onOpen={onOpen}
      selected={selected}
      recentlyMoved={task.recentlyMoved}
      saving={task.saving}
      draggable={draggable}
    >
      <div {...stylex.props(styles.title)}>
        {task.blocked && (
          <span
            role="img"
            aria-label="Blocked"
            title="Blocked"
            {...stylex.props(styles.blockedDot)}
          />
        )}
        <Text
          size="sm"
          weight="medium"
          xstyle={task.isCompleted ? styles.completedTitle : undefined}
        >
          {task.title}
        </Text>
      </div>
      {previewSlot}
      <div {...stylex.props(styles.meta)}>
        <PriorityIcon level={task.priority} />
        {task.label && <LabelChip name={task.label.name} color={task.label.color} />}
        {(task.start_label || task.due_label) && (
          <span {...stylex.props(styles.due)}>
            {task.start_label && task.due_label
              ? `${task.start_label} → ${task.due_label}`
              : (task.start_label ?? task.due_label)}
          </span>
        )}
        {task.checklist_summary && task.checklist_summary.total > 0 && (
          <ChecklistChip
            total={task.checklist_summary.total}
            checked={task.checklist_summary.checked}
          />
        )}
        <AvatarStack assignees={task.assignees} />
      </div>
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
