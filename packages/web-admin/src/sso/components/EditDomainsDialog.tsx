import {
  Banner,
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  Input,
  Layout,
  LayoutContent,
} from '@seta/shared-ui';
import { useState } from 'react';
import { DomainsField } from '../../components/DomainsField.tsx';
import { registerProvider } from '../api/sso-client.ts';

interface EditDomainsDialogProps {
  // Owned by integrations; null until the Microsoft 365 integration is configured.
  entraTenantId: string | null;
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
      await registerProvider({ email_domains: domains });
      onSaved();
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) resetState();
  }

  return (
    <>
      <Button variant="secondary" size="sm" label="Edit domains" onClick={() => setOpen(true)} />
      <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form">
        <Layout
          header={<DialogHeader title="Edit email domains" onOpenChange={handleOpenChange} />}
          content={
            <LayoutContent>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Input
                    label="Entra tenant ID"
                    value={entraTenantId ?? ''}
                    placeholder="Configured via the Microsoft 365 integration"
                    isDisabled
                  />
                </div>
                <DomainsField domains={domains} onChange={setDomains} />
                {error && <Banner status="error" title={error} />}
              </div>
            </LayoutContent>
          }
          footer={
            <DialogFooter>
              <Button variant="secondary" label="Cancel" onClick={() => setOpen(false)} />
              <Button variant="primary" label="Save" onClick={submit} isDisabled={submitting} />
            </DialogFooter>
          }
        />
      </Dialog>
    </>
  );
}
