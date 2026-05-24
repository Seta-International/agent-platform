import { Card } from '@seta/shared-ui';

export function ProfileRolesCard({ roles }: { roles: string[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-base font-semibold tracking-tight">Roles</h2>
        <span className="text-xs text-ink-subtle">Your admin manages these.</span>
      </div>
      <p className="text-sm text-ink-muted mt-0 mb-3.5">
        What you can see and change in this app. Need a different role?{' '}
        <span className="text-primary">Ask your admin</span>.
      </p>

      {roles.length === 0 ? (
        <div className="rounded-md border border-hairline px-3.5 py-3 text-sm text-ink-muted">
          No roles yet.
        </div>
      ) : (
        <div className="rounded-md border border-hairline overflow-hidden">
          {roles.map((slug, i) => (
            <div
              key={slug}
              className="grid grid-cols-[1.4fr_1fr_90px] items-center px-3.5 py-2.5 text-sm"
              style={{
                borderBottom:
                  i === roles.length - 1 ? undefined : '1px solid var(--color-hairline-tertiary)',
              }}
            >
              <span className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary" />
                <span className="font-mono text-[12.5px]">{slug}</span>
              </span>
              <span className="text-sm text-ink-muted">Organization</span>
              <span className="justify-self-end inline-flex items-center h-[18px] rounded-full bg-surface-2 border border-transparent px-1.5 text-[11px] text-ink-muted">
                Manual
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
