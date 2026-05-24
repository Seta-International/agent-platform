export interface MailTransportRow {
  kind: 'graph' | 'smtp';
  sender_address: string;
  sender_display_name: string | null;
  config:
    | { app_access_policy_documented: boolean }
    | { host: string; port: number; username: string; require_tls: boolean };
  enabled: boolean;
  last_verified_at: string | null;
  last_verify_error: string | null;
}

export type SetMailTransportInput =
  | {
      kind: 'graph';
      senderAddress: string;
      senderDisplayName: string | null;
      config: { app_access_policy_documented: boolean };
    }
  | {
      kind: 'smtp';
      senderAddress: string;
      senderDisplayName: string | null;
      config: {
        host: string;
        port: 465 | 587;
        username: string;
        password: string;
        require_tls: boolean;
      };
    };

export interface VerifyMailTransportResult {
  ok: boolean;
  transport_message_id?: string | null;
  error?: { code: string; message: string };
}

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ message: `HTTP ${res.status}` }))) as {
      message?: string;
    };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getMailTransport(): Promise<MailTransportRow | null> {
  const res = await fetch('/api/integrations/v1/mail-transport', { credentials: 'include' });
  return (await jsonOrThrow(res)) as MailTransportRow | null;
}

export async function setMailTransport(input: SetMailTransportInput): Promise<void> {
  const res = await fetch('/api/integrations/v1/mail-transport', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  await jsonOrThrow(res);
}

export async function disableMailTransport(): Promise<void> {
  const res = await fetch('/api/integrations/v1/mail-transport', {
    method: 'DELETE',
    credentials: 'include',
  });
  await jsonOrThrow(res);
}

export async function verifyMailTransport(recipient: string): Promise<VerifyMailTransportResult> {
  const res = await fetch('/api/integrations/v1/mail-transport/verify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recipient }),
  });
  return (await jsonOrThrow(res)) as VerifyMailTransportResult;
}
