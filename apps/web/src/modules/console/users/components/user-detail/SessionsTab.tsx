import { Badge, Button, Card, formatRelative } from '@seta/shared-ui';
import { useCallback, useEffect, useState } from 'react';
import { parseUserAgent } from '@/lib/parse-user-agent.ts';
import {
  type AdminUserSession,
  listUserSessionsApi,
  revokeUserSessionApi,
} from '../../api/users-client.ts';

export function SessionsTab({ userId, onCount }: { userId: string; onCount: (n: number) => void }) {
  const [rows, setRows] = useState<AdminUserSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listUserSessionsApi(userId);
      setRows(r);
      onCount(r.length);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId, onCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- delegates to refresh() which manages loading/error/rows state
    void refresh();
  }, [refresh]);

  if (loading) return <Card className="p-5 text-sm text-ink-muted">Loading…</Card>;
  if (error) return <Card className="p-5 text-sm text-destructive">{error}</Card>;
  if (rows.length === 0)
    return <Card className="p-5 text-sm text-ink-muted">No active sessions</Card>;

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-2">
        {rows.map((s) => {
          const ua = parseUserAgent(s.user_agent);
          return (
            <div
              key={s.session_id}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded border border-hairline p-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  {ua.browser} · {ua.os}
                  {s.is_current && (
                    <Badge variant="secondary" className="h-4 text-[10px]">
                      You
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-ink-muted">
                  {s.ip_address ?? 'unknown ip'} · last active {formatRelative(s.updated_at)}
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={s.is_current}
                title={s.is_current ? 'Use the user menu to sign yourself out.' : 'Revoke session'}
                onClick={async () => {
                  if (!confirm('Sign this user out of this session?')) return;
                  await revokeUserSessionApi(userId, s.session_id);
                  await refresh();
                }}
              >
                Revoke
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
