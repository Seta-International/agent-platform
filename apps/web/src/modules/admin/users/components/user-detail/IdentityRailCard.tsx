import { Card } from '@seta/shared-ui';
import type { ReactNode } from 'react';
import type { AdminUserDetail } from '../../api/users-client.ts';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-hairline last:border-b-0 text-sm">
      <span className="text-ink-muted text-xs uppercase tracking-wider">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function authLabel(methods?: string[]): string {
  if (!methods || methods.length === 0) return '—';
  const c = methods.includes('credential');
  const m = methods.includes('microsoft');
  if (c && m) return 'Password + Microsoft';
  if (c) return 'Password';
  if (m) return 'Microsoft';
  return methods.join(', ');
}

export function IdentityRailCard({ detail }: { detail: AdminUserDetail }) {
  const wh = detail.profile.working_hours;
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-muted mb-2">Identity</div>
      <Row label="Email">
        <span
          className="font-mono text-sm truncate max-w-[200px] inline-block align-bottom"
          title={detail.profile.email}
        >
          {detail.profile.email}
        </span>
      </Row>
      <Row label="Sign-in">
        <span className="text-sm">{authLabel(detail.sign_in_methods)}</span>
      </Row>
      <Row label="Joined">
        <span className="text-sm" suppressHydrationWarning>
          {detail.profile.updated_at
            ? new Date(detail.profile.updated_at).toLocaleDateString()
            : '\u2014'}
        </span>
      </Row>
      <Row label="Timezone">{detail.profile.timezone}</Row>
      <Row label="Hours">{wh ? `Mon–Fri ${wh.start}–${wh.end}` : '—'}</Row>
    </Card>
  );
}
