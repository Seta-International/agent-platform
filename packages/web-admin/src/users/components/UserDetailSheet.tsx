import { Badge, Sheet, SheetContent, SheetHeader, SheetTitle } from '@seta/shared-ui';
import type { DirectoryRow } from '../api/directory-client.ts';

const ACCOUNT_STATUS_BADGE: Record<
  DirectoryRow['account_status'],
  'outline' | 'success' | 'destructive'
> = {
  none: 'outline',
  active: 'success',
  suspended: 'destructive',
};

const ACCOUNT_STATUS_LABEL: Record<DirectoryRow['account_status'], string> = {
  none: 'No account',
  active: 'Active',
  suspended: 'Suspended',
};

const EMPLOYMENT_BADGE: Record<DirectoryRow['employment_status'], 'success' | 'secondary'> = {
  active: 'success',
  terminated: 'secondary',
};

const EMPLOYMENT_LABEL: Record<DirectoryRow['employment_status'], string> = {
  active: 'Employed',
  terminated: 'Terminated',
};

interface Props {
  row: DirectoryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">{label}</span>
      <div className="text-body-sm text-ink">{children}</div>
    </div>
  );
}

export function UserDetailSheet({ row, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-96 sm:max-w-96 overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{row?.full_name ?? '—'}</SheetTitle>
        </SheetHeader>

        {row && (
          <div className="flex flex-col gap-5">
            <Field label="Email">
              {row.work_email ?? <span className="text-ink-tertiary">—</span>}
            </Field>

            <Field label="Job title">
              {row.job_title ?? <span className="text-ink-tertiary">—</span>}
            </Field>

            <Field label="Employment">
              <Badge variant={EMPLOYMENT_BADGE[row.employment_status]}>
                {EMPLOYMENT_LABEL[row.employment_status]}
              </Badge>
            </Field>

            <Field label="Account">
              <Badge variant={ACCOUNT_STATUS_BADGE[row.account_status]}>
                {ACCOUNT_STATUS_LABEL[row.account_status]}
              </Badge>
            </Field>

            <Field label="Roles">
              {row.roles.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {row.roles.map((r) => (
                    <Badge key={r} variant="secondary">
                      {r}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-ink-tertiary">No roles assigned</span>
              )}
            </Field>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
