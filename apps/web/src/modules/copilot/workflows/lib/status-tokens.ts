import type { WorkflowRunStatus } from '../api/schemas.ts';

interface StatusToken {
  label: string;
  dot: string;
  bg: string;
  ink: string;
}

export const STATUS_TOKENS: Record<WorkflowRunStatus, StatusToken> = {
  pending: {
    label: 'Pending',
    dot: 'var(--color-ink-subtle)',
    bg: 'var(--color-surface-2)',
    ink: 'var(--color-ink-subtle)',
  },
  running: {
    label: 'Running',
    dot: 'var(--color-primary)',
    bg: 'var(--color-primary-tint)',
    ink: 'var(--color-primary)',
  },
  paused: {
    label: 'Paused',
    dot: 'var(--color-warning-ink)',
    bg: 'var(--color-warning-tint)',
    ink: 'var(--color-warning-ink)',
  },
  success: {
    label: 'Success',
    dot: 'var(--color-success-ink)',
    bg: 'var(--color-success-tint)',
    ink: 'var(--color-success-ink)',
  },
  failed: {
    label: 'Failed',
    dot: 'var(--color-danger-ink)',
    bg: 'var(--color-danger-tint)',
    ink: 'var(--color-danger-ink)',
  },
  tripwire: {
    label: 'Tripwire',
    dot: 'var(--color-info-ink)',
    bg: 'var(--color-info-tint)',
    ink: 'var(--color-info-ink)',
  },
  canceled: {
    label: 'Canceled',
    dot: 'var(--color-ink-subtle)',
    bg: 'var(--color-surface-2)',
    ink: 'var(--color-ink-subtle)',
  },
};

export function tokenFor(status: string): StatusToken {
  return (STATUS_TOKENS as Record<string, StatusToken>)[status] ?? STATUS_TOKENS.pending;
}

const STEP_STATUS_MAP: Record<string, WorkflowRunStatus> = {
  success: 'success',
  running: 'running',
  failed: 'failed',
  suspended: 'paused',
  pending: 'pending',
  skipped: 'canceled',
};

export function stepStatusToRunStatus(stepStatus: string | undefined): WorkflowRunStatus {
  if (!stepStatus) return 'pending';
  return STEP_STATUS_MAP[stepStatus] ?? 'pending';
}
