import { Sparkles } from 'lucide-react';

// Renders the same placeholder content as the shared-ui CopilotPlaceholder.
// PR-B replaces this body with header + chip + transcript + composer.
export function CopilotSidePanel() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 inline-flex size-9 items-center justify-center rounded-full bg-primary-tint text-primary">
          <Sparkles className="size-4" aria-hidden />
        </div>
        <h2 className="text-body-sm font-semibold text-ink">Copilot is on its way</h2>
        <p className="mt-1.5 max-w-xs text-caption leading-[1.5] text-ink-muted">
          Chat, workflow runs, and HITL approvals will live here. Read tools run inline; writes
          always pause for your confirmation.
        </p>
      </div>
      <div className="flex-none border-t border-hairline p-3">
        <div className="flex h-9 items-center gap-2 rounded-md border border-hairline-strong bg-canvas px-3 text-caption text-ink-tertiary">
          <Sparkles className="size-3.5 text-ink-tertiary" aria-hidden />
          <span>Ask copilot…</span>
        </div>
      </div>
    </div>
  );
}
