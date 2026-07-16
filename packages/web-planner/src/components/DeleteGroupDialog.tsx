import type { GroupRow } from '@seta/planner';
import {
  Banner,
  Button,
  Dialog,
  DialogHeader,
  Layout,
  LayoutContent,
  LayoutFooter,
} from '@seta/shared-ui';

interface Props {
  group: GroupRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  error: string | null;
}

export function DeleteGroupDialog({
  group,
  open,
  onOpenChange,
  onConfirm,
  isPending,
  error,
}: Props) {
  const isM365 = group.external_source === 'm365';

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="required">
      <Layout
        header={<DialogHeader title="Delete group?" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-4">
              <p className="text-body-sm text-ink-subtle">
                This group will be deleted. You can restore it later from the Archived filter.
                {isM365 && (
                  <>
                    {' '}
                    It is linked to Microsoft 365 — deleting here pauses sync but does not remove
                    the group from Microsoft 365.
                  </>
                )}
              </p>
              {error && <Banner status="error" title={error} />}
            </div>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Button
              variant="secondary"
              label="Cancel"
              onClick={() => onOpenChange(false)}
              isDisabled={isPending}
            />
            <Button
              variant="destructive"
              label="Delete"
              onClick={onConfirm}
              isDisabled={isPending}
            />
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
