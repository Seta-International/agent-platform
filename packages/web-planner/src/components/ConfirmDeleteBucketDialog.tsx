import { Button, Dialog, DialogFooter, DialogHeader, Layout } from '@seta/shared-ui';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bucketName: string;
  onConfirm: () => void;
  pending?: boolean;
}

export function ConfirmDeleteBucketDialog({
  open,
  onOpenChange,
  bucketName,
  onConfirm,
  pending = false,
}: Props) {
  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="required">
      <Layout
        header={
          <DialogHeader
            title={`Delete "${bucketName}"?`}
            subtitle="All tasks in this bucket will also be deleted."
            onOpenChange={onOpenChange}
          />
        }
        footer={
          <DialogFooter>
            <Button
              variant="ghost"
              label="Cancel"
              onClick={() => onOpenChange(false)}
              isDisabled={pending}
            />
            <Button variant="destructive" label="Delete" onClick={onConfirm} isDisabled={pending} />
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
