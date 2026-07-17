import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  DisabledActionTooltip,
  Divider,
  DropdownMenu,
  DropdownMenuItem,
} from '@seta/shared-ui';
import { ArrowRightLeft, Copy, MoreHorizontal, Sparkles } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';

interface Props {
  taskNumber: number;
  groupId?: string;
  groupName: string;
  planId?: string;
  planName: string;
  bucketName: string | null;
  /** Editable title slot (TaskTitleEditor) — rendered prominently below the breadcrumb. */
  titleSlot: ReactNode;
  onBack: () => void;
  onAskAgent: () => void;
  onCopyLink: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onDuplicate?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
  /** When set, the matching menu item renders disabled with this reason as a tooltip. */
  duplicateDisabledReason?: string;
  moveDisabledReason?: string;
  deleteDisabledReason?: string;
}

function isEditableTarget(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  const tag = node.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (node.isContentEditable) return true;
  return false;
}

export function TaskDetailHeader({
  taskNumber,
  groupId,
  groupName,
  planId,
  planName,
  bucketName,
  titleSlot,
  onBack,
  onAskAgent,
  onCopyLink,
  onPrevious,
  onNext,
  onDuplicate,
  onMove,
  onDelete,
  duplicateDisabledReason,
  moveDisabledReason,
  deleteDisabledReason,
}: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        onPrevious();
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        onNext();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onPrevious, onNext]);

  return (
    <header className="border-b border-hairline overflow-x-auto">
      <div className="min-w-[1040px] px-7 pt-4 pb-3">
        <div className="mb-3">
          <Breadcrumbs variant="supporting">
            <BreadcrumbItem href="/planner">Planner</BreadcrumbItem>
            {groupId ? (
              <BreadcrumbItem href={`/planner/groups/${groupId}`}>{groupName}</BreadcrumbItem>
            ) : (
              <BreadcrumbItem>{groupName}</BreadcrumbItem>
            )}
            {planId ? (
              // Keeps a real href so the crumb is a genuine link; a modified click (cmd/ctrl/shift)
              // falls through to real navigation (new tab / new window), while a plain click
              // intercepts and returns to the board in place instead of navigating.
              <BreadcrumbItem
                href={`/planner/plans/${planId}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  onBack();
                }}
              >
                {planName}
              </BreadcrumbItem>
            ) : (
              <BreadcrumbItem>{planName}</BreadcrumbItem>
            )}
            {bucketName && <BreadcrumbItem>{bucketName}</BreadcrumbItem>}
            <BreadcrumbItem isCurrent>{`T-${taskNumber}`}</BreadcrumbItem>
          </Breadcrumbs>
        </div>

        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">{titleSlot}</div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Sparkles className="size-3" />}
              label="Ask agent"
              onClick={onAskAgent}
            />
            <Button
              size="sm"
              variant="secondary"
              icon={<Copy className="size-3" />}
              label="Copy link"
              onClick={onCopyLink}
            />
            {(onDuplicate || onMove || onDelete) && (
              <DropdownMenu
                placement="below"
                button={{
                  isIconOnly: true,
                  icon: <MoreHorizontal className="size-4" />,
                  variant: 'ghost',
                  size: 'sm',
                  label: 'More actions',
                }}
              >
                {onDuplicate && (
                  <DisabledActionTooltip
                    disabled={Boolean(duplicateDisabledReason)}
                    reason={duplicateDisabledReason}
                  >
                    <DropdownMenuItem
                      icon={<Copy className="size-3.5" />}
                      label="Duplicate"
                      onClick={() => onDuplicate()}
                      isDisabled={Boolean(duplicateDisabledReason)}
                    />
                  </DisabledActionTooltip>
                )}
                {onMove && (
                  <DisabledActionTooltip
                    disabled={Boolean(moveDisabledReason)}
                    reason={moveDisabledReason}
                  >
                    <DropdownMenuItem
                      icon={<ArrowRightLeft className="size-3.5" />}
                      label="Move…"
                      onClick={() => onMove()}
                      isDisabled={Boolean(moveDisabledReason)}
                    />
                  </DisabledActionTooltip>
                )}
                {onDelete && (
                  <DisabledActionTooltip
                    disabled={Boolean(deleteDisabledReason)}
                    reason={deleteDisabledReason}
                  >
                    <DropdownMenuItem
                      label="Delete"
                      style={{ color: 'var(--color-danger)' }}
                      onClick={() => onDelete()}
                      isDisabled={Boolean(deleteDisabledReason)}
                    />
                  </DisabledActionTooltip>
                )}
              </DropdownMenu>
            )}
            <Divider orientation="vertical" style={{ height: 20 }} />
            <button
              type="button"
              onClick={onPrevious}
              aria-label="Previous task"
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-ink-subtle hover:bg-surface-1 hover:text-ink"
            >
              <span>Prev</span>
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next task"
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-ink-subtle hover:bg-surface-1 hover:text-ink"
            >
              <span>Next</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
