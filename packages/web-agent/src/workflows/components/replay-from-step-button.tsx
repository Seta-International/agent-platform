import { useState } from 'react';

const RUN_TERMINAL = new Set(['success', 'failed', 'tripwire', 'canceled']);
const STEP_TERMINAL = new Set(['success', 'failed', 'tripwire']);

export interface ReplayFromStepButtonProps {
  runStatus: string;
  stepStatus: string;
  stepId: string;
  originalPayload: unknown;
  onReplay: (args: { stepId: string; originalPayload: unknown }) => Promise<void>;
}

export function ReplayFromStepButton({
  runStatus,
  stepStatus,
  stepId,
  originalPayload,
  onReplay,
}: ReplayFromStepButtonProps) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!RUN_TERMINAL.has(runStatus) || !STEP_TERMINAL.has(stepStatus)) return null;

  const handleClick = async () => {
    setPending(true);
    setFailed(false);
    try {
      await onReplay({ stepId, originalPayload });
      setPending(false);
    } catch {
      setFailed(true);
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        className="rounded border border-[var(--color-hairline)] px-2 py-0.5 text-xs hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => void handleClick()}
      >
        {pending ? 'Replaying…' : 'Replay from here'}
      </button>
      {failed ? (
        <span className="text-[10px] text-[var(--color-destructive)]">Replay failed</span>
      ) : null}
    </div>
  );
}
