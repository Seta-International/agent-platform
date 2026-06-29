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
import { registerProvider } from '../api/sso-client.ts';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function ConnectEntraDialog({ onConnected }: { onConnected: () => void }) {
  const [open, setOpen] = useState(false);
  const [entraTenantId, setEntraTenantId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setEntraTenantId('');
    setError(null);
  }

  async function submit() {
    if (!isUuid(entraTenantId)) {
      setError("That doesn't look like an Entra tenant ID. Paste the UUID from your Azure portal.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await registerProvider({ entra_tenant_id: entraTenantId });
      onConnected();
      setOpen(false);
      reset();
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
        <Button>Connect Microsoft Entra ID</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Microsoft Entra ID</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="connect-entra-tenant-id">Entra tenant ID (UUID)</Label>
            <Input
              id="connect-entra-tenant-id"
              value={entraTenantId}
              onChange={(e) => setEntraTenantId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
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
            <Button onClick={submit} disabled={submitting}>
              Connect
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
