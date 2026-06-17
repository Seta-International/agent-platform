import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@seta/shared-ui';
import { useState } from 'react';

async function patchUserEmail(userId: string, new_email: string): Promise<void> {
  const res = await fetch(`/api/identity/v1/users/${userId}/email`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ new_email }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `patch failed: ${res.status}`);
  }
}

export function ChangeEmailDialog({
  userId,
  currentEmail,
  disabled,
  onChanged,
}: {
  userId: string;
  currentEmail: string;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setNewEmail('');
    setError(null);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await patchUserEmail(userId, newEmail);
      setOpen(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          Change email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="change-email-current">Current email</Label>
            <Input id="change-email-current" value={currentEmail} readOnly />
          </div>
          <div className="space-y-1">
            <Label htmlFor="change-email-new">New email</Label>
            <Input
              id="change-email-new"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting || !newEmail}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
