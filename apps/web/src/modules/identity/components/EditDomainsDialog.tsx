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

interface EditDomainsDialogProps {
  entraTenantId: string;
  initialDomains: string[];
  onSaved: () => void;
}

export function EditDomainsDialog({
  entraTenantId,
  initialDomains,
  onSaved,
}: EditDomainsDialogProps) {
  const [open, setOpen] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [domains, setDomains] = useState<string[]>(initialDomains);
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

  function resetState() {
    setDomainInput('');
    setDomains(initialDomains);
    setError(null);
  }

  async function submit() {
    if (domains.length === 0) {
      setError('At least one email domain is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await registerProvider({ entra_tenant_id: entraTenantId, email_domains: domains });
      onSaved();
      setOpen(false);
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
        if (!v) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Edit domains
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit email domains</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="edit-domains-tenant-id">Entra tenant ID</Label>
            <Input
              id="edit-domains-tenant-id"
              value={entraTenantId}
              readOnly
              className="text-muted-foreground"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-domains-domain-input">Email domains</Label>
            <div className="flex gap-2">
              <Input
                id="edit-domains-domain-input"
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
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
