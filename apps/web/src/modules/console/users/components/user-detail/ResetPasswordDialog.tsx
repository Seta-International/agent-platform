import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@seta/shared-ui';
import { useState } from 'react';
import { resetUserPasswordApi } from '../../api/users-client.ts';

export function ResetPasswordDialog({
  open,
  userId,
  email,
  onOpenChange,
}: {
  open: boolean;
  userId: string;
  email: string;
  onOpenChange: (v: boolean) => void;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await resetUserPasswordApi(userId);
      setPassword(r.password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setPassword(null);
          setError(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {email}</DialogTitle>
          <DialogDescription>
            A new random password will be generated. Convey it out-of-band; the user can change it
            on first login.
          </DialogDescription>
        </DialogHeader>
        {!password && !error && (
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? 'Resetting…' : 'Generate new password'}
          </Button>
        )}
        {password && (
          <div className="space-y-2">
            <p className="text-sm text-ink-muted">Copy this now: it will not be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="bg-surface-2 rounded px-2 py-1 font-mono text-sm flex-1 break-all">
                {password}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void navigator.clipboard.writeText(password)}
              >
                Copy
              </Button>
            </div>
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
