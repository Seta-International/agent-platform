import { Card } from '@seta/shared-ui';

export function ProfileRolesCard({ roles }: { roles: string[] }) {
  return (
    <Card padding={5}>
      <div className="flex items-baseline justify-between gap-4 mb-3.5">
        <p className="text-sm text-secondary m-0">
          What you can see and change in this app. Need a different role?{' '}
          <span className="text-accent">Ask your admin</span>.
        </p>
        <span className="flex-none text-xs text-secondary">Your admin manages these.</span>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-md border border-border px-3.5 py-3 text-sm text-secondary">
          No roles yet.
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          {roles.map((slug, i) => (
            <div
              key={slug}
              className="grid grid-cols-[1.4fr_1fr_90px] items-center px-3.5 py-2.5 text-sm"
              style={{
                borderBottom: i === roles.length - 1 ? undefined : '1px solid var(--color-border)',
              }}
            >
              <span className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-accent-bg" />
                <span className="font-mono text-sm">{slug}</span>
              </span>
              <span className="text-sm text-secondary">Organization</span>
              <span className="justify-self-end inline-flex items-center h-[18px] rounded-full bg-surface border border-transparent px-1.5 text-xs text-secondary">
                Manual
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
