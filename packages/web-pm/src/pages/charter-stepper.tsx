import { Check } from 'lucide-react';
import type { CharterStatus } from '../api/pm-client.ts';

const STEPS: ReadonlyArray<readonly [string, string]> = [
  ['Submitted', 'Request created by PM'],
  ['PMO Review', 'PMO sign-off'],
  ['BoD Review', 'Board approval'],
  ['Project created', 'Live in Portfolio'],
];

function progress(status: CharterStatus, rejectedStage: 'pmo' | 'bod' | null) {
  switch (status) {
    case 'submitted':
      return { doneCount: 1, active: 1 };
    case 'pmo_approved':
      return { doneCount: 2, active: 2 };
    case 'approved':
      return { doneCount: 4, active: -1 };
    case 'rejected':
      return { doneCount: rejectedStage === 'bod' ? 2 : 1, active: -1 };
    default:
      return { doneCount: 1, active: -1 };
  }
}

export function CharterStepper({
  status,
  rejectedStage = null,
}: {
  status: CharterStatus;
  rejectedStage?: 'pmo' | 'bod' | null;
}) {
  const { doneCount, active } = progress(status, rejectedStage);
  return (
    <div className="flex flex-wrap items-center gap-0">
      {STEPS.map(([label, sub], i) => {
        const done = i < doneCount;
        const isActive = i === active;
        return (
          <div key={label} className="flex items-center" style={{ minWidth: 150 }}>
            <div className="flex items-center gap-[9px]">
              <span
                className="grid size-[26px] flex-shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold"
                style={
                  done
                    ? {
                        background: 'var(--color-success)',
                        borderColor: 'var(--color-success)',
                        color: '#fff',
                      }
                    : isActive
                      ? {
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-primary)',
                          boxShadow:
                            '0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent)',
                        }
                      : { borderColor: 'var(--color-hairline)', color: 'var(--color-ink-muted)' }
                }
              >
                {done ? <Check className="size-[13px]" /> : i + 1}
              </span>
              <div>
                <div
                  className="text-[12px] font-semibold leading-tight"
                  style={isActive ? { color: 'var(--color-primary)' } : undefined}
                >
                  {label}
                </div>
                <div className="text-[10.5px] text-ink-muted">{sub}</div>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="mx-[10px] h-[2px] min-w-[18px] flex-1"
                style={{
                  background: i < doneCount - 1 ? 'var(--color-success)' : 'var(--color-hairline)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
