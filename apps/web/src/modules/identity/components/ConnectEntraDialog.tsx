import {
  Alert,
  AlertDescription,
  Badge,
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
  const [domainInput, setDomainInput] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addDomain() {
    const trimmed = domainInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!domains.includes(trimmed)) {
      setDomains((prev) => [...prev, trimmed]);
    }
    setDomainInput('');
  }

  function removeDomain(d: string) {
    setDomains((prev) => prev.filter((x) => x !== d));
  }

  function reset() {
    setEntraTenantId('');
    setDomainInput('');
    setDomains([]);
    setError(null);
  }

  async function submit() {
    if (!isUuid(entraTenantId)) {
      setError('Entra tenant ID must be a valid UUID.');
      return;
    }
    if (domains.length === 0) {
      setError('Add at least one email domain.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await registerProvider({ entra_tenant_id: entraTenantId, email_domains: domains });
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
          <div className="space-y-1">
            <Label htmlFor="connect-entra-domain-input">Email domains</Label>
            <div className="flex gap-2">
              <Input
                id="connect-entra-domain-input"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="contoso.com"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDomain();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={addDomain}>
                Add
              </Button>
            </div>
            {domains.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {domains.map((d) => (
                  <Badge key={d} variant="secondary" className="gap-1">
                    {d}
                    <button
                      type="button"
                      className="ml-1 hover:text-destructive"
                      onClick={() => removeDomain(d)}
                      aria-label={`Remove ${d}`}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
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
