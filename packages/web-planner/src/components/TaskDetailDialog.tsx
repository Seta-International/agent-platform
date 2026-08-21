import { Dialog, IconButton, Layout, LayoutContent } from '@seta/shared-ui';
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
 *
 * Special case (no visible header/footer): `TaskDetailPage` renders its own visible header
 * (breadcrumb + title + the close/expand buttons below), so this shell must NOT render a
 * second `DialogHeader` — that would stack two header bars. Instead the dialog's accessible
 * name is set directly via `aria-label`, mirroring the original's screen-reader-only
 * `DialogTitle` without a visible duplicate. There's no footer either — `TaskDetailPage`'s
 * own header already hosts the close/expand actions.
 */
export function TaskDetailDialog({ planId, taskId, onClose, onOpenFullPage }: Props) {
  return (
    <Dialog
      isOpen
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      purpose="info"
      width={1080}
      maxHeight="88vh"
      padding={0}
      aria-label="Task"
    >
      <Layout
        padding={0}
        content={
          <LayoutContent padding={0} isScrollable={false}>
            <div className="flex max-h-[88vh] flex-col">
              <TaskDetailPage
                planId={planId}
                taskId={taskId}
                variant="modal"
                onDeleted={onClose}
                onClose={onClose}
                modalHeaderActions={
                  <>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={onOpenFullPage}
                      tooltip="Open as full page"
                      label="Open as full page"
                      icon={<Maximize2 className="size-4" />}
                    />
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={onClose}
                      tooltip="Close"
                      label="Close"
                      icon={<X className="size-4" />}
                    />
                  </>
                }
              />
            </div>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
