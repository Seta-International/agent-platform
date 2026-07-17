import { X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Button } from '../primitives/button';
import { IconButton } from '../primitives/icon-button';
import { HStack, LayoutPanel, VStack } from '../primitives/layout';
import { ProgressBar } from '../primitives/progress-bar';
import { ResizeHandle, useResizable } from '../primitives/resizable';
import { Heading, Text } from '../primitives/text';
import { AvatarStack } from './avatar-stack';
import { LabelChip } from './label-chip';
import { PriorityIcon } from './priority-icon';
import { StatusToneDot } from './status-tone-dot';
import { SyncBadge, type SyncState } from './sync-badge';

export interface PeekTask {
  id: string;
  title: string;
  status?: { label: string; tone: 'muted' | 'primary' | 'warning' | 'success' | 'danger' };
  priority?: { label: string; level: 'urgent' | 'important' | 'medium' | 'low' };
  assignees: ReadonlyArray<{ user_id: string; display_name: string }>;
  start?: string | null;
  due?: string | null;
  labels: ReadonlyArray<{ id: string; name: string; color?: string }>;
  percentComplete?: number;
  plan?: string;
  bucket?: string;
  external_source?: 'native' | 'm365';
  sync_status?: SyncState | null;
  external_synced_at?: string | null;
}

export interface TaskPeekPanelProps {
  task: PeekTask | null;
  onClose: () => void;
  onOpenFull: (taskId: string) => void;
  /** localStorage key for width persistence (useResizable's autoSaveId is a no-op in core@0.1.6). */
  storageKey: string;
}

function readStoredWidth(key: string): number | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredWidth(key: string, width: number): void {
  try {
    window.localStorage.setItem(key, String(Math.round(width)));
  } catch {
    // Private mode / quota — width just won't persist.
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <HStack gap={3} vAlign="center">
      <span className="w-20 shrink-0 text-sm text-secondary">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-base text-primary">
        {children}
      </div>
    </HStack>
  );
}

export function TaskPeekPanel({ task, onClose, onOpenFull, storageKey }: TaskPeekPanelProps) {
  const initialWidth = useMemo(() => readStoredWidth(storageKey) ?? 360, [storageKey]);
  const region = useResizable({
    defaultSize: initialWidth,
    minSizePx: 280,
    maxSizePx: 520,
    onSizeChange: (size) => writeStoredWidth(storageKey, size),
  });

  const isOpen = task !== null;
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!task) return null;

  return (
    // The panel owns the separator (hasDivider); the handle stays divider-less
    // and hover-only so no pill floats over the panel edge when idle.
    <>
      <ResizeHandle resizable={region.props} isReversed isAlwaysVisible={false} />
      <LayoutPanel
        hasDivider
        resizable={region.props}
        padding={4}
        role="complementary"
        label="Task details"
        data-testid="task-peek-panel"
      >
        <VStack gap={4}>
          <HStack gap={2} vAlign="center">
            <div className="min-w-0 flex-1">
              <Text type="supporting" color="secondary">
                Task details
              </Text>
            </div>
            <IconButton
              label="Close panel"
              size="sm"
              variant="ghost"
              icon={<X className="size-4" aria-hidden />}
              onClick={onClose}
            />
          </HStack>

          <VStack gap={1}>
            <HStack gap={2} vAlign="center">
              <Heading level={3}>{task.title}</Heading>
              {task.external_source === 'm365' && (
                <SyncBadge
                  state={task.sync_status ?? null}
                  synced_at={task.external_synced_at ?? null}
                  size="mini"
                />
              )}
            </HStack>
            {task.plan && (
              <Text type="supporting" color="secondary">
                {task.plan}
                {task.bucket ? ` · ${task.bucket}` : ''}
              </Text>
            )}
          </VStack>

          <VStack gap={3}>
            {task.status && (
              <MetaRow label="Status">
                <StatusToneDot tone={task.status.tone} label={task.status.label} />
                <span>{task.status.label}</span>
              </MetaRow>
            )}
            {task.priority && (
              <MetaRow label="Priority">
                <PriorityIcon level={task.priority.level} />
                <span>{task.priority.label}</span>
              </MetaRow>
            )}
            <MetaRow label="Assignees">
              {task.assignees.length === 0 ? (
                <span className="text-disabled">—</span>
              ) : (
                <div className="flex items-center">
                  <AvatarStack assignees={task.assignees} max={5} />
                </div>
              )}
            </MetaRow>
            {task.start !== undefined && <MetaRow label="Start">{formatDate(task.start)}</MetaRow>}
            <MetaRow label="Due">{formatDate(task.due)}</MetaRow>
            {task.labels.length > 0 && (
              <MetaRow label="Labels">
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {task.labels.map((l) => (
                    <LabelChip key={l.id} name={l.name} color={l.color} />
                  ))}
                </div>
              </MetaRow>
            )}
            {task.percentComplete !== undefined && (
              <MetaRow label="Progress">
                <div className="min-w-0 flex-1">
                  <ProgressBar
                    label="Task progress"
                    isLabelHidden
                    value={task.percentComplete}
                    max={100}
                    hasValueLabel
                  />
                </div>
              </MetaRow>
            )}
          </VStack>

          <Button
            label="Open full details"
            variant="secondary"
            size="sm"
            onClick={() => onOpenFull(task.id)}
          />
        </VStack>
      </LayoutPanel>
    </>
  );
}
