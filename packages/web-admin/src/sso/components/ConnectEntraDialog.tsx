import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@seta/shared-ui';
import { useState } from 'react';
import { registerProvider } from '../api/sso-client.ts';

export function ConnectEntraDialog({ onConnected }: { onConnected: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      // The Entra tenant linkage is owned by integrations and projected in once the tenant's
      // Microsoft 365 integration is configured; the admin no longer supplies it here.
      await registerProvider({});
      onConnected();
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Connect Microsoft Entra ID</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Microsoft Entra ID</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="m-0 text-body-sm text-ink-subtle">
            The Microsoft tenant link is set up from the Microsoft 365 integration. Connect here to
            start managing sign-in for your team, then add your email domains.
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting}>
              Connect
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
