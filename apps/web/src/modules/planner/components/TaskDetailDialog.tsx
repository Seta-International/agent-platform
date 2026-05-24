import { Dialog, DialogContent, DialogTitle } from '@seta/shared-ui';
import { Maximize2, X } from 'lucide-react';
import { TaskDetailPage } from '../pages/task-detail-page';

interface Props {
  planId: string;
  taskId: string;
  /** Closing the dialog navigates back to the plan board. */
  onClose: () => void;
  /** Escalate from modal to the full standalone detail page. */
  onOpenFullPage: () => void;
}

/**
 * Centered modal wrapper around `TaskDetailPage`.
 *
 * The dialog supplies the dimmed-board overlay; `TaskDetailPage` in `variant="modal"`
 * renders its own compact header (breadcrumb + title) and receives our action buttons
 * via `modalHeaderActions` so they sit alongside the title rather than overlapping it.
 */
export function TaskDetailDialog({ planId, taskId, onClose, onOpenFullPage }: Props) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        hideClose
        unstyled
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex max-h-[88vh] w-[min(1080px,92vw)] flex-col overflow-hidden rounded-xl"
      >
        <DialogTitle className="sr-only">Task</DialogTitle>
        <TaskDetailPage
          planId={planId}
          taskId={taskId}
          variant="modal"
          modalHeaderActions={
            <>
              <button
                type="button"
                onClick={onOpenFullPage}
                title="Open as full page"
                aria-label="Open as full page"
                className="inline-flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
              >
                <Maximize2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                aria-label="Close"
                className="inline-flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus"
              >
                <X className="size-4" />
              </button>
            </>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
