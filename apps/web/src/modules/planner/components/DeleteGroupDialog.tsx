import type { GroupRow } from '@seta/planner';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete group?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-body-sm text-ink-subtle">
            This group will be deleted. You can restore it later from the Archived filter.
            {isM365 && (
              <>
                {' '}
                It is linked to Microsoft 365 — deleting here pauses sync but does not remove the
                group from Microsoft 365.
              </>
            )}
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
