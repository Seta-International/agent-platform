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
  labelName: string;
  onConfirm: () => void;
  pending?: boolean;
}

export function ConfirmDeleteLabelDialog({
  open,
  onOpenChange,
  labelName,
  onConfirm,
  pending = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{labelName}&rdquo;?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-body-sm text-ink-subtle">
              <p>This removes the label from every task in this plan. It can&apos;t be undone.</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            Delete label
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
