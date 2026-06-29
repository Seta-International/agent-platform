import {
  Button,
  Combobox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@seta/shared-ui';
import { useMemo, useState } from 'react';
import { useRoleAccessMatrix } from '../../role-access/hooks/useRoleAccess.ts';
import { useBulkRole } from '../hooks/useDirectory.ts';

interface Props {
  selectedUserIds: string[];
  onClearSelection: () => void;
}

export function BulkRoleBar({ selectedUserIds, onClearSelection }: Props) {
  const [roleSlug, setRoleSlug] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'grant' | 'revoke' | null>(null);

  const { data: matrixData } = useRoleAccessMatrix();
  const bulkRole = useBulkRole();

  const roleOptions = useMemo(() => {
    if (!matrixData) return [];
    const seen = new Set<string>();
    return matrixData
      .filter((r) => !seen.has(r.slug) && seen.add(r.slug))
      .map((r) => ({ value: r.slug, label: r.slug }));
  }, [matrixData]);

  const count = selectedUserIds.length;

  function openConfirm(action: 'grant' | 'revoke') {
    setPendingAction(action);
  }

  function handleConfirm() {
    if (!roleSlug || !pendingAction) return;
    bulkRole.mutate(
      { user_ids: selectedUserIds, role_slug: roleSlug, action: pendingAction },
      { onSuccess: () => onClearSelection() },
    );
    setPendingAction(null);
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-hairline bg-surface-2 px-6 py-2">
        <span className="text-body-sm font-medium text-ink">{count} selected</span>
        <Button variant="tertiary" size="sm" onClick={onClearSelection}>
          Clear
        </Button>
        <Combobox
          value={roleSlug}
          onChange={setRoleSlug}
          options={roleOptions}
          placeholder="Pick a role…"
          className="w-52"
          aria-label="Role"
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!roleSlug || bulkRole.isPending}
          onClick={() => openConfirm('grant')}
        >
          Assign
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!roleSlug || bulkRole.isPending}
          onClick={() => openConfirm('revoke')}
        >
          Remove
        </Button>
      </div>

      <Dialog
        open={pendingAction !== null}
        onOpenChange={(o) => {
          if (!o) setPendingAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction === 'grant' ? 'Assign' : 'Remove'} role?</DialogTitle>
            <DialogDescription>
              {pendingAction === 'grant'
                ? `Assign "${roleSlug}" to ${count} ${count === 1 ? 'user' : 'users'}.`
                : `Remove "${roleSlug}" from ${count} ${count === 1 ? 'user' : 'users'}.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button variant="default" disabled={bulkRole.isPending} onClick={handleConfirm}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
