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
  memberName: string;
  onConfirm: () => void;
  isPending?: boolean;
}

export function ConfirmRemoveMemberDialog({
  open,
  onOpenChange,
  memberName,
  onConfirm,
  isPending = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[480px]"
        onEscapeKeyDown={(e) => {
          if (isPending) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Remove member?</DialogTitle>
          <DialogDescription>
            {memberName} will lose access to this group and its plans immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
