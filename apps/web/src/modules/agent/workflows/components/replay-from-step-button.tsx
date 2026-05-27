const RUN_TERMINAL = new Set(['success', 'failed', 'tripwire', 'canceled']);
const STEP_TERMINAL = new Set(['success', 'failed', 'tripwire']);

export interface ReplayFromStepButtonProps {
  runStatus: string;
  stepStatus: string;
  stepId: string;
  originalPayload: unknown;
  onReplay: (args: { stepId: string; originalPayload: unknown }) => void;
}

export function ReplayFromStepButton({
  runStatus,
  stepStatus,
  stepId,
  originalPayload,
  onReplay,
}: ReplayFromStepButtonProps) {
  if (!RUN_TERMINAL.has(runStatus) || !STEP_TERMINAL.has(stepStatus)) return null;
  return (
    <button
      type="button"
      className="rounded border border-[var(--color-hairline)] px-2 py-0.5 text-xs hover:bg-[var(--color-surface-2)]"
      onClick={() => onReplay({ stepId, originalPayload })}
    >
      Replay from here
    </button>
  );
}
