import { Button, Dialog, DialogHeader, Layout, LayoutContent, LayoutFooter } from '@seta/shared-ui';

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
            <div className="space-y-2 text-body-sm text-secondary">
              <p>This removes the label from every task in this plan. It can&apos;t be undone.</p>
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
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
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
