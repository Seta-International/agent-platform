import { Button, Dialog, DialogFooter, DialogHeader, Layout } from '@seta/shared-ui';

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
    <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="required">
      <Layout
        header={
          <DialogHeader
            title="Remove member?"
            subtitle={`${memberName} will lose access to this group and its plans immediately.`}
            onOpenChange={onOpenChange}
          />
        }
        footer={
          <DialogFooter>
            <Button
              variant="ghost"
              label="Cancel"
              onClick={() => onOpenChange(false)}
              isDisabled={isPending}
            />
            <Button
              variant="destructive"
              label="Remove"
              onClick={onConfirm}
              isDisabled={isPending}
            />
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
