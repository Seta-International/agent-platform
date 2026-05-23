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
import { createAdminUser } from '../api/users-client.ts';
import { TENANT_ROLE_SLUGS } from '../constants.ts';

const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_';
const PASSWORD_ALPHA_LEN = PASSWORD_ALPHABET.length;
const PASSWORD_REJECT_THRESHOLD = 256 - (256 % PASSWORD_ALPHA_LEN);

function generatePassword(): string {
  const len = 24;
  let s = '';
  while (s.length < len) {
    const buf = new Uint8Array(len - s.length);
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && s.length < len; i++) {
      const b = buf[i] as number;
      if (b < PASSWORD_REJECT_THRESHOLD) s += PASSWORD_ALPHABET[b % PASSWORD_ALPHA_LEN];
    }
  }
  return s;
}

export function CreateUserDialog({
  onCreated,
  triggerLabel = 'Create user',
}: {
  onCreated: () => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState(generatePassword());
  const [role, setRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await createAdminUser({ email, name, password, initial_role: role || undefined });
      setCreatedPassword(password);
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setEmail('');
    setName('');
    setPassword(generatePassword());
    setRole('');
    setError(null);
    setCreatedPassword(null);
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
        <Button>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{createdPassword ? 'User created' : 'Create user'}</DialogTitle>
        </DialogHeader>
        {createdPassword ? (
          <div className="space-y-3">
            <Alert>
              <AlertDescription>
                Password (one-time display):{' '}
                <code className="break-all font-mono">{createdPassword}</code>
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button onClick={() => navigator.clipboard.writeText(createdPassword)}>
                Copy password
              </Button>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
              <Button variant="ghost" size="sm" onClick={() => setPassword(generatePassword())}>
                Regenerate
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-user-role">Initial role (optional)</Label>
              <select
                id="create-user-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">No role</option>
                {TENANT_ROLE_SLUGS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
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
              <Button
                onClick={submit}
                disabled={submitting || !email || !name || password.length < 12}
              >
                Create
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
