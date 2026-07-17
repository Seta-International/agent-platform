import { Button, Dialog, DialogFooter, DialogHeader, Layout } from '@seta/shared-ui';

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
    <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="required">
      <Layout
        header={
          <DialogHeader
            title={`Remove ${count} ${count === 1 ? 'member' : 'members'}?`}
            subtitle="They will lose access to this group and its plans immediately."
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
