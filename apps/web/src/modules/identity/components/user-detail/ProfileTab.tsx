import { Badge, Card } from '@seta/shared-ui';
import type { ReactNode } from 'react';
import type { AdminUserDetail } from '../../api/client.ts';
import { ChangeEmailDialog } from '../ChangeEmailDialog.tsx';
import { EmailHistorySection } from '../EmailHistorySection.tsx';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3 py-2 border-b border-hairline last:border-b-0">
      <span className="text-xs uppercase tracking-wider text-ink-muted">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function ProfileTab({
  detail,
  userId,
  onChange,
}: {
  detail: AdminUserDetail;
  userId: string;
  onChange: () => void;
}) {
  const wh = detail.profile.working_hours;
  return (
    <Card className="p-5">
      <Row label="Name">{detail.profile.display_name}</Row>
      <Row label="Email">
        <div className="flex items-center gap-2">
          <span className="font-mono">{detail.profile.email}</span>
          <ChangeEmailDialog
            userId={userId}
            currentEmail={detail.profile.email}
            disabled={false}
            onChanged={onChange}
          />
        </div>
      </Row>
      <Row label="Timezone">{detail.profile.timezone}</Row>
      <Row label="Working hours">{wh ? `Mon–Fri ${wh.start}–${wh.end}` : '—'}</Row>
      <Row label="Availability">
        <Badge variant="outline">{detail.profile.availability_status}</Badge>
        {detail.profile.ooo_until && (
          <span className="ml-2 text-xs text-ink-muted">until {detail.profile.ooo_until}</span>
        )}
      </Row>
      <Row label="Skills">
        <div className="flex flex-wrap gap-1">
          {detail.profile.skills.length === 0 ? (
            <span className="text-ink-muted text-sm">None</span>
          ) : (
            detail.profile.skills.map((s) => (
              <Badge key={s} variant="secondary">
                {s}
              </Badge>
            ))
          )}
        </div>
      </Row>
      <div className="mt-3">
        <EmailHistorySection userId={userId} />
      </div>
    </Card>
  );
}
