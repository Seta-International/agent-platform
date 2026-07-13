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
  count: number;
  onConfirm: () => void;
  isPending?: boolean;
}

export function ConfirmRemoveMembersDialog({
  open,
  onOpenChange,
  count,
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
          <DialogTitle>
            Remove {count} {count === 1 ? 'member' : 'members'}?
          </DialogTitle>
          <DialogDescription>
            They will lose access to this group and its plans immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            label="Cancel"
            onClick={() => onOpenChange(false)}
            isDisabled={isPending}
          />
          <Button variant="destructive" label="Remove" onClick={onConfirm} isDisabled={isPending} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
