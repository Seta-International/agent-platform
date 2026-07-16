import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { HStack, Layout, LayoutContent, LayoutHeader, VStack } from '@astryxdesign/core/Layout';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import * as stylex from '@stylexjs/stylex';
import { GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { DropdownMenu, DropdownMenuItem } from '../primitives/dropdown-menu';
import { DisabledActionTooltip } from './disabled-action-tooltip';
import { KanbanCardList } from './kanban-card-list';
import { KanbanColumnCompose, type QuickCreateTaskInput } from './kanban-column-compose';

export type { QuickCreateTaskInput } from './kanban-column-compose';

const styles = stylex.create({
  shell: { flexShrink: 0 },
  shellDragging: { opacity: 0.9 },
  handleArea: { minWidth: 0, flex: 1, cursor: 'grab', ':active': { cursor: 'grabbing' } },
  grip: { color: 'var(--color-ink-tertiary)', flexShrink: 0 },
  gripDisabled: { opacity: 0.4 },
  countOver: { color: 'var(--color-danger)', fontWeight: 600 },
  dangerItem: { color: 'var(--color-danger)' },
  quickCreate: { alignSelf: 'flex-start' },
});

export interface KanbanColumnProps {
  name: string;
  count: number;
  status?: 'neutral' | 'accent' | 'warning' | 'success';
  children: ReactNode;
  completedTasks?: { count: number; children: ReactNode };
  onCreateTask?: (input: QuickCreateTaskInput) => void | Promise<void>;
  /** When set, blocks submit and shows an inline error if the trimmed title exceeds this length. */
  titleMaxLength?: number;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  onSetColor?: () => void;
  onSetWipLimit?: () => void;
  onArchive?: () => void;
  /**
   * When set, the corresponding trigger renders disabled with this reason (tooltip on
   * standalone buttons; inline description on menu items) — for users who lack the
   * relevant permission. The owning callback is still passed so the trigger stays visible.
   */
  createTaskDisabledReason?: string;
  renameDisabledReason?: string;
  deleteDisabledReason?: string;
  /** When set, the drag handle is shown disabled (column reorder requires bucket update permission). */
  reorderDisabledReason?: string;
  /** Header status-dot color (hex). null = default status dot. */
  color?: string | null;
  /** WIP limit; null = none. */
  wipLimit?: number | null;
  /** M365-linked bucket: color/wip/archive actions are hidden. */
  isLinked?: boolean;
  /** Column width in px (flex-basis in the board row). */
  width?: number;
  droppable: {
    ref?: (el: HTMLElement | null) => void;
    rootProps?: HTMLAttributes<HTMLElement>;
    isDraggingOver?: boolean;
    placeholder?: ReactNode;
  };
  draggableHandle?: {
    ref?: (el: HTMLElement | null) => void;
    rootProps?: HTMLAttributes<HTMLElement>;
    handleProps?: HTMLAttributes<HTMLElement>;
    isDragging?: boolean;
    extraStyle?: CSSProperties;
  };
}

export function KanbanColumn({
  name,
  count,
  status,
  children,
  completedTasks,
  onCreateTask,
  titleMaxLength,
  onRename,
  onDelete,
  onSetColor,
  onSetWipLimit,
  onArchive,
  createTaskDisabledReason,
  renameDisabledReason,
  deleteDisabledReason,
  reorderDisabledReason,
  color,
  wipLimit,
  isLinked,
  width = 280,
  droppable,
  draggableHandle,
}: KanbanColumnProps) {
  const [composing, setComposing] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const committedRef = useRef(false);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  function openRename() {
    setRenameValue(name);
    cancelledRef.current = false;
    committedRef.current = false;
    setRenaming(true);
  }

  function commitRename() {
    if (cancelledRef.current || committedRef.current) return;
    committedRef.current = true;
    const v = renameValue.trim();
    if (v && v !== name) onRename?.(v);
    setRenaming(false);
  }

  async function handleCreate(input: QuickCreateTaskInput) {
    await onCreateTask?.(input);
    setComposing(false);
  }

  const handle = draggableHandle;
  const reorderDisabled = Boolean(reorderDisabledReason);
  const localActions = !isLinked;
  const hasMenu = Boolean(
    onRename || onDelete || (localActions && (onSetColor || onSetWipLimit || onArchive)),
  );
  const overLimit = wipLimit != null && count > wipLimit;

  return (
    <Card
      ref={handle?.ref as ((el: HTMLDivElement | null) => void) | undefined}
      {...handle?.rootProps}
      variant="muted"
      padding={0}
      width={width}
      role="region"
      aria-label={`Bucket: ${name}`}
      xstyle={[styles.shell, handle?.isDragging && styles.shellDragging]}
      style={handle?.extraStyle}
      data-dragging={handle?.isDragging ? 'true' : undefined}
    >
      <Layout
        height="auto"
        header={
          <LayoutHeader hasDivider padding={2}>
            <HStack hAlign="between" vAlign="center" gap={1}>
              <HStack
                gap={1.5}
                vAlign="center"
                xstyle={styles.handleArea}
                {...(handle && !renaming && !reorderDisabled ? handle.handleProps : {})}
              >
                {handle &&
                  (reorderDisabled ? (
                    <DisabledActionTooltip disabled reason={reorderDisabledReason}>
                      <GripVertical
                        size={12}
                        aria-hidden="true"
                        data-kanban-grip
                        {...stylex.props(styles.grip, styles.gripDisabled)}
                      />
                    </DisabledActionTooltip>
                  ) : (
                    <GripVertical
                      size={12}
                      aria-hidden="true"
                      data-kanban-grip
                      {...stylex.props(styles.grip)}
                    />
                  ))}
                <StatusDot
                  variant={status ?? 'neutral'}
                  label={`${name} status`}
                  data-kanban-status-dot=""
                  style={color ? { backgroundColor: color } : undefined}
                />
                {renaming ? (
                  <TextInput
                    ref={renameRef}
                    label="Bucket name"
                    isLabelHidden
                    size="sm"
                    value={renameValue}
                    onChange={setRenameValue}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') {
                        cancelledRef.current = true;
                        setRenaming(false);
                      }
                    }}
                    onBlur={commitRename}
                  />
                ) : (
                  <>
                    <Text size="sm" weight="semibold" maxLines={1}>
                      {name}
                    </Text>
                    <Text
                      size="2xs"
                      color="secondary"
                      hasTabularNumbers
                      xstyle={overLimit ? styles.countOver : undefined}
                      data-over-limit={overLimit ? 'true' : undefined}
                    >
                      {wipLimit != null ? `${count}/${wipLimit}` : count}
                    </Text>
                  </>
                )}
              </HStack>

              {!renaming && (onCreateTask || hasMenu) && (
                <HStack gap={0.5} vAlign="center">
                  {onCreateTask && (
                    <DisabledActionTooltip
                      disabled={Boolean(createTaskDisabledReason)}
                      reason={createTaskDisabledReason}
                    >
                      <Button
                        label="Add task"
                        variant="ghost"
                        size="sm"
                        isIconOnly
                        icon={<Plus size={12} aria-hidden />}
                        isDisabled={Boolean(createTaskDisabledReason)}
                        onClick={() => setComposing(true)}
                      />
                    </DisabledActionTooltip>
                  )}
                  {hasMenu && (
                    <DropdownMenu
                      placement="below"
                      hasChevron={false}
                      button={{
                        label: 'More options',
                        variant: 'ghost',
                        size: 'sm',
                        isIconOnly: true,
                        icon: <MoreHorizontal size={12} aria-hidden />,
                      }}
                    >
                      {onRename && (
                        <DropdownMenuItem
                          label="Rename bucket"
                          isDisabled={Boolean(renameDisabledReason)}
                          description={renameDisabledReason}
                          onClick={openRename}
                        />
                      )}
                      {onCreateTask && (
                        <DropdownMenuItem
                          label="Add task here"
                          isDisabled={Boolean(createTaskDisabledReason)}
                          description={createTaskDisabledReason}
                          onClick={() => setComposing(true)}
                        />
                      )}
                      {localActions && onSetColor && (
                        <DropdownMenuItem label="Set color" onClick={onSetColor} />
                      )}
                      {localActions && onSetWipLimit && (
                        <DropdownMenuItem label="Set WIP limit" onClick={onSetWipLimit} />
                      )}
                      {localActions && onArchive && (
                        <DropdownMenuItem label="Archive bucket" onClick={onArchive} />
                      )}
                      {onDelete && (
                        <DropdownMenuItem
                          label="Delete bucket"
                          isDisabled={Boolean(deleteDisabledReason)}
                          description={deleteDisabledReason}
                          xstyle={styles.dangerItem}
                          onClick={onDelete}
                        />
                      )}
                    </DropdownMenu>
                  )}
                </HStack>
              )}
            </HStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={2}>
            <VStack gap={1.5}>
              {!composing && onCreateTask && (
                <DisabledActionTooltip
                  disabled={Boolean(createTaskDisabledReason)}
                  reason={createTaskDisabledReason}
                >
                  <Button
                    label="+ Add a task"
                    variant="ghost"
                    size="sm"
                    isDisabled={Boolean(createTaskDisabledReason)}
                    onClick={() => setComposing(true)}
                    xstyle={styles.quickCreate}
                  />
                </DisabledActionTooltip>
              )}

              {composing && (
                <KanbanColumnCompose
                  titleMaxLength={titleMaxLength}
                  onSubmit={handleCreate}
                  onCancel={() => setComposing(false)}
                />
              )}

              <KanbanCardList
                ref={droppable.ref as ((el: HTMLDivElement | null) => void) | undefined}
                rootProps={droppable.rootProps as HTMLAttributes<HTMLDivElement> | undefined}
                isDraggingOver={droppable.isDraggingOver}
              >
                {children}
                {droppable.placeholder}
              </KanbanCardList>

              {completedTasks && completedTasks.count > 0 && (
                <Collapsible
                  isOpen={completedExpanded}
                  onOpenChange={setCompletedExpanded}
                  trigger={
                    <Text size="2xs" color="secondary">
                      Completed ({completedTasks.count})
                    </Text>
                  }
                >
                  <VStack gap={1.5}>{completedTasks.children}</VStack>
                </Collapsible>
              )}
            </VStack>
          </LayoutContent>
        }
      />
    </Card>
  );
}
