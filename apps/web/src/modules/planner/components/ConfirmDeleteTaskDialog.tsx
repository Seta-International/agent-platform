import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@seta/shared-ui';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  taskTitle: string;
  onConfirm: () => void;
  pending?: boolean;
}

export function ConfirmDeleteTaskDialog({
  open,
  onOpenChange,
  taskTitle,
  onConfirm,
  pending = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Delete this task?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-body-sm text-ink-subtle">
              <p>
                <span className="text-ink">&ldquo;{taskTitle}&rdquo;</span> moves to Trash. You can
                restore it within 30 days; after that, it is gone for good.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            Delete task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
