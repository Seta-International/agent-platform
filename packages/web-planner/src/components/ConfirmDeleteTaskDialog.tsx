import { Button, Dialog, DialogHeader, Layout, LayoutContent, LayoutFooter } from '@seta/shared-ui';

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
    <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="required">
      <Layout
        header={<DialogHeader title="Delete this task?" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-2 text-body-sm text-secondary">
              <p>
                <span className="text-primary">&ldquo;{taskTitle}&rdquo;</span> moves to Trash. You
                can restore it within 30 days; after that, it is gone for good.
              </p>
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
              label="Delete task"
              onClick={onConfirm}
              isDisabled={pending}
            />
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
