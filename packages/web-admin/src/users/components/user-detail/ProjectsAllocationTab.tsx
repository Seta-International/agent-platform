import { Card } from '@seta/shared-ui';

export function ProjectsAllocationTab() {
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3.5">
          <span className="text-[11px] uppercase tracking-wider text-ink-muted font-medium">
            This week&apos;s capacity
          </span>
          <span className="text-xs text-ink-subtle">Tracking coming soon</span>
        </div>

        <div className="flex items-baseline gap-2.5 mb-2.5">
          <span className="text-3xl font-semibold tracking-tight text-ink-tertiary">
            {'\u2014'}
          </span>
          <span className="text-sm text-ink-muted">not allocated to any project yet</span>
        </div>
        <div className="h-3.5 rounded-full bg-surface-2 mb-2" />
        <div className="text-xs text-ink-subtle">
          Project allocations will show here once they&apos;re set up.
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3.5">
          <span className="text-[11px] uppercase tracking-wider text-ink-muted font-medium">
            Projects
          </span>
        </div>
        <div className="rounded-md border border-dashed border-hairline-strong px-6 py-10 text-center">
          <div className="text-sm font-medium text-ink">No projects yet</div>
          <p className="mt-1 text-sm text-ink-subtle">
            Projects will show here once this person is added to one.
          </p>
        </div>
      </Card>
    </div>
  );
}
