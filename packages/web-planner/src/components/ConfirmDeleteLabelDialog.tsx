import { Button, Dialog, DialogFooter, DialogHeader, Layout, LayoutContent } from '@seta/shared-ui';

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
    <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="required">
      <Layout
        header={<DialogHeader title={`Delete “${labelName}”?`} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-2 text-base text-secondary">
              <p>This removes the label from every task in this plan. It can&apos;t be undone.</p>
            </div>
          </LayoutContent>
        }
        footer={
          <DialogFooter>
            <Button
              variant="ghost"
              label="Cancel"
              onClick={() => onOpenChange(false)}
              isDisabled={pending}
            />
            <Button
              variant="destructive"
              label="Delete label"
              onClick={onConfirm}
              isDisabled={pending}
            />
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
