import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  formatRelative,
  KbdHint,
} from '@seta/shared-ui';
import { ChevronLeft, ChevronRight, Copy, MoreHorizontal, Sparkles } from 'lucide-react';
import { useEffect } from 'react';

interface Props {
  taskNumber: number;
  title: string;
  groupName: string;
  planName: string;
  bucketName: string | null;
  createdAt: string;
  updatedAt: string;
  creatorName: string;
  onBack: () => void;
  onAskCopilot: () => void;
  onCopyLink: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onMenuAction?: (action: 'duplicate' | 'archive' | 'delete') => void;
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
  title,
  groupName,
  planName,
  bucketName,
  createdAt,
  updatedAt,
  creatorName,
  onBack,
  onAskCopilot,
  onCopyLink,
  onPrevious,
  onNext,
  onMenuAction,
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
    <header className="border-b border-hairline px-7 pt-4 pb-3">
      <div className="mb-3 flex items-center gap-2 text-xs text-ink-subtle">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to board"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-1"
        >
          <ChevronLeft className="size-3" />
          Back to board
        </button>
        <span>·</span>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1">
          <span>Planner</span>
          <ChevronRight className="size-2.5 text-ink-tertiary" aria-hidden="true" />
          <span>{groupName}</span>
          <ChevronRight className="size-2.5 text-ink-tertiary" aria-hidden="true" />
          <span>{planName}</span>
          {bucketName && (
            <>
              <ChevronRight className="size-2.5 text-ink-tertiary" aria-hidden="true" />
              <span className="text-primary">{bucketName}</span>
            </>
          )}
        </nav>
      </div>

      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="mono inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 text-caption text-ink-subtle">
              T-{taskNumber}
            </span>
            <h1 className="text-card-title font-semibold">{title}</h1>
          </div>
          <div className="mt-1 text-xs text-ink-subtle">
            Created {formatRelative(createdAt)} by {creatorName} · Last updated{' '}
            {formatRelative(updatedAt)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onAskCopilot}>
            <Sparkles className="size-3" />
            Ask copilot
          </Button>
          <Button size="sm" variant="secondary" onClick={onCopyLink}>
            <Copy className="size-3" />
            Copy link
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className="inline-flex items-center justify-center rounded p-1 text-ink-subtle hover:bg-surface-1 hover:text-ink"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onMenuAction?.('duplicate')}>
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMenuAction?.('archive')}>
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onMenuAction?.('delete')}
                className="text-semantic-danger"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span aria-hidden="true" className="h-5 w-px bg-hairline" />
          <button
            type="button"
            onClick={onPrevious}
            aria-label="Previous task"
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-ink-subtle hover:bg-surface-1 hover:text-ink"
          >
            <KbdHint keys={['K']} />
            <span>Prev</span>
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next task"
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-ink-subtle hover:bg-surface-1 hover:text-ink"
          >
            <span>Next</span>
            <KbdHint keys={['J']} />
          </button>
        </div>
      </div>
    </header>
  );
}
