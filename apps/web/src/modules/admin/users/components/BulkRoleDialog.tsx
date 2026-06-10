import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Label,
  toast,
} from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { bulkRoleAssign } from '../api/users-client.ts';
import { TENANT_ROLE_SLUGS } from '../constants.ts';

export function BulkRoleDialog({
  action,
  userIds,
  open,
  onOpenChange,
  onDone,
}: {
  action: 'grant' | 'revoke';
  userIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [role, setRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the picker each time the dialog opens.
  useEffect(() => {
    if (open) {
      setRole('');
      setError(null);
    }
  }, [open]);

  const verb = action === 'grant' ? 'Grant' : 'Remove';
  const preposition = action === 'grant' ? 'to' : 'from';
  const count = userIds.length;

  async function confirm() {
    if (!role) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await bulkRoleAssign({ user_ids: userIds, role_slug: role, action });
      const applied = action === 'grant' ? res.granted : res.revoked;
      toast(
        `${verb}ed ${role}: ${applied} ${action === 'grant' ? 'granted' : 'revoked'}, ${res.skipped} skipped` +
          (res.failed.length ? `, ${res.failed.length} failed` : ''),
      );
      if (res.failed.length) {
        toast.error(
          `Failed for ${res.failed.length} user(s): ${res.failed.map((f) => f.reason).join(', ')}`,
        );
      }
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action === 'grant' ? 'Assign role' : 'Remove role'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="bulk-role-select">Role</Label>
            <select
              id="bulk-role-select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Pick a role…</option>
              {TENANT_ROLE_SLUGS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {role && (
            <p className="text-sm text-ink-muted">
              {verb} <span className="font-medium text-ink">{role}</span> {preposition} {count}{' '}
              {count === 1 ? 'user' : 'users'}?
            </p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={confirm} disabled={submitting || !role}>
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
