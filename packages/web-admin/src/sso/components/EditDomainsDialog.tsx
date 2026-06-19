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
import { DomainsField } from '../../components/DomainsField.tsx';
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
  const [domains, setDomains] = useState<string[]>(initialDomains);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetState() {
    setDomains(initialDomains);
    setError(null);
  }

  async function submit() {
    if (domains.length === 0) {
      setError('Add at least one email domain.');
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
          <DomainsField domains={domains} onChange={setDomains} idPrefix="edit-domains" />
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
