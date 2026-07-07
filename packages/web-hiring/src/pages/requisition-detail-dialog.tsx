import { Dialog, DialogContent, DialogTitle } from '@seta/shared-ui';
import { RequisitionDetailView } from './requisition-detail-view.tsx';

interface Props {
  requisitionId: string;
  onClose: () => void;
}

/** Centered modal wrapper around `RequisitionDetailView`, mirroring `TaskDetailDialog`. */
export function RequisitionDetailDialog({ requisitionId, onClose }: Props) {
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
        className="w-[min(1100px,94vw)]"
      >
        <DialogTitle className="sr-only">Job description</DialogTitle>
        {/*
         * `overflow-hidden` (for the rounded corners) lives on this inner wrapper, not on
         * DialogContent itself: DialogContent carries Radix's centering transform, which
         * makes it the containing block for any `position: fixed` popover/select/dropdown
         * portaled into its sibling portal-container div (see dialog-portal-container.ts).
         * `overflow-hidden` directly on that transformed element would clip those floating
         * layers (e.g. the skill picker's "Add skill" popover) instead of just the corners.
         */}
        <div className="flex max-h-[88vh] flex-col overflow-hidden rounded-xl">
          <RequisitionDetailView requisitionId={requisitionId} variant="modal" onClose={onClose} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
