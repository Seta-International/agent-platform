import { useState } from 'react';

interface EmailAuditRow {
  event_id: string;
  occurred_at: string;
  payload: {
    old_email?: string;
    new_email?: string;
    reason?: 'admin' | 'sso_sync';
  } | null;
}

async function fetchEmailHistory(userId: string): Promise<EmailAuditRow[]> {
  const params = new URLSearchParams({
    event_type: 'identity.user.email.changed',
    aggregate_id: userId,
    limit: '50',
    offset: '0',
  });
  const res = await fetch(`/api/identity/v1/audit?${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`audit fetch failed: ${res.status}`);
  return ((await res.json()) as { rows: EmailAuditRow[] }).rows;
}

export function EmailHistorySection({ userId }: { userId: string }) {
  const [rows, setRows] = useState<EmailAuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen(open: boolean) {
    if (!open || rows !== null) return;
    try {
      setRows(await fetchEmailHistory(userId));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <details
      className="mt-2 text-sm"
      onToggle={(e) => void handleOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Email history
      </summary>
      <div className="mt-2 space-y-1 pl-2">
        {error && <p className="text-destructive text-xs">{error}</p>}
        {rows === null && !error && <p className="text-muted-foreground text-xs">Loading…</p>}
        {rows !== null && rows.length === 0 && (
          <p className="text-muted-foreground text-xs">No email changes recorded.</p>
        )}
        {rows?.map((row) => {
          const oldEmail = row.payload?.old_email ?? '—';
          const newEmail = row.payload?.new_email ?? '—';
          const reason = row.payload?.reason ?? '';
          return (
            <div key={row.event_id} className="text-xs">
              <span className="text-muted-foreground" suppressHydrationWarning>
                {new Date(row.occurred_at).toLocaleString()}
              </span>{' '}
              <span>
                {oldEmail} → {newEmail}
              </span>
              {reason && <span className="text-muted-foreground ml-1">({reason})</span>}
            </div>
          );
        })}
      </div>
    </details>
  );
}
