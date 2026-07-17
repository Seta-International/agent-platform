import { Check, X } from 'lucide-react';
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
      return { doneCount: 1, active: 1, failedAt: -1 };
    case 'pmo_approved':
      return { doneCount: 2, active: 2, failedAt: -1 };
    case 'approved':
      return { doneCount: 4, active: -1, failedAt: -1 };
    case 'rejected':
      return {
        doneCount: rejectedStage === 'bod' ? 2 : 1,
        active: -1,
        failedAt: rejectedStage === 'bod' ? 2 : 1,
      };
    default:
      return { doneCount: 1, active: -1, failedAt: -1 };
  }
}

/**
 * Horizontal governance rail. `compact` (used in list rows) drops the sub-labels
 * and shrinks the markers so the rail reads as a quiet progress strip; `full`
 * (used on the detail page) keeps the descriptive sub-labels.
 */
export function CharterStepper({
  status,
  rejectedStage = null,
  variant = 'full',
}: {
  status: CharterStatus;
  rejectedStage?: 'pmo' | 'bod' | null;
  variant?: 'full' | 'compact';
}) {
  const { doneCount, active, failedAt } = progress(status, rejectedStage);
  const compact = variant === 'compact';
  const dot = compact ? 'size-[18px] text-2xs' : 'size-[26px] text-xs';
  const icon = compact ? 'size-3' : 'size-[13px]';
  const minWidth = compact ? 112 : 150;

  return (
    <div className="flex flex-wrap items-center gap-y-2">
      {STEPS.map(([label, sub], i) => {
        const failed = i === failedAt;
        const done = i < doneCount;
        const isActive = i === active;
        const marker = failed
          ? { background: 'var(--color-error)', borderColor: 'var(--color-error)', color: '#fff' }
          : done
            ? {
                background: 'var(--color-success)',
                borderColor: 'var(--color-success)',
                color: '#fff',
              }
            : isActive
              ? {
                  borderColor: 'var(--color-accent)',
                  color: 'var(--color-accent)',
                  boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-accent) 18%, transparent)',
                }
              : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' };
        return (
          <div key={label} className="flex items-center" style={{ minWidth }}>
            <div className="flex items-center gap-2">
              <span
                className={`grid ${dot} flex-shrink-0 place-items-center rounded-full border-2 font-bold`}
                style={marker}
              >
                {failed ? <X className={icon} /> : done ? <Check className={icon} /> : i + 1}
              </span>
              <div className="leading-tight">
                <div
                  className={compact ? 'text-xs font-medium' : 'text-sm font-semibold'}
                  style={
                    failed
                      ? { color: 'var(--color-error)' }
                      : isActive
                        ? { color: 'var(--color-accent)' }
                        : undefined
                  }
                >
                  {label}
                </div>
                {!compact && <div className="text-xs text-secondary">{sub}</div>}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`${compact ? 'mx-2 min-w-[14px]' : 'mx-[10px] min-w-[18px]'} h-[2px] flex-1`}
                style={{
                  background: i < doneCount - 1 ? 'var(--color-success)' : 'var(--color-border)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
