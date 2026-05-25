import { Card } from '@seta/shared-ui';
import { type ReactNode, useState } from 'react';
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

// Rail column is ~320px; ~60 chars/line × 3 lines ≈ 180. Newline-heavy bios
// can also exceed the 3-line clamp before they hit the char limit.
function bioExceedsClamp(bio: string): boolean {
  return bio.length > 180 || (bio.match(/\n/g)?.length ?? 0) >= 3;
}

function AboutBlock({ bio }: { bio: string | null }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="pt-3 mt-2 border-t border-hairline">
      <div className="text-ink-muted text-xs uppercase tracking-wider mb-1.5">About</div>
      {bio ? (
        <>
          <p className={`text-sm text-ink whitespace-pre-line ${expanded ? '' : 'line-clamp-3'}`}>
            {bio}
          </p>
          {bioExceedsClamp(bio) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs text-ink-muted hover:text-ink"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-subtle italic">No bio set.</p>
      )}
    </div>
  );
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
            : '—'}
        </span>
      </Row>
      <Row label="Timezone">{detail.profile.timezone}</Row>
      <Row label="Hours">{wh ? `Mon–Fri ${wh.start}–${wh.end}` : '—'}</Row>
      <AboutBlock bio={detail.profile.bio} />
    </Card>
  );
}
