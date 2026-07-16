import { Dialog, Layout, LayoutContent } from '@seta/shared-ui';
import { RequisitionDetailView } from './requisition-detail-view.tsx';

interface Props {
  requisitionId: string;
  onClose: () => void;
}

/**
 * Centered modal wrapper around `RequisitionDetailView`, mirroring `TaskDetailDialog`.
 *
 * Special case (no visible header/footer): `RequisitionDetailView` renders its own visible
 * header (close button + title + status), so this shell must NOT render a `DialogHeader` —
 * that would stack two header bars. The dialog's accessible name is set directly via
 * `aria-label`, mirroring the original's screen-reader-only `DialogTitle`.
 */
export function RequisitionDetailDialog({ requisitionId, onClose }: Props) {
  return (
    <Dialog
      isOpen
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      purpose="info"
      width={1100}
      maxHeight="88vh"
      padding={0}
      aria-label="Job description"
    >
      <Layout
        padding={0}
        content={
          <LayoutContent padding={0} isScrollable={false}>
            {/*
             * `overflow-hidden` (for the rounded corners) lives on this inner wrapper, not on
             * Dialog/LayoutContent directly: Astryx's Dialog applies its own directional
             * entrance-animation transform (--dialog-dir-x/--dialog-dir-y) to the <dialog>
             * element, which can make it a CSS containing block for any `position: fixed`
             * popover portaled elsewhere in the DOM (e.g. the skill picker's "Add skill"
             * popover). `overflow-hidden` directly on that transformed element would clip
             * those floating layers instead of just rounding the corners.
             */}
            <div className="flex max-h-[88vh] flex-col overflow-hidden rounded-xl">
              <RequisitionDetailView
                requisitionId={requisitionId}
                variant="modal"
                onClose={onClose}
              />
            </div>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
