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
    dot: 'var(--color-text-secondary)',
    bg: 'var(--color-background-surface)',
    ink: 'var(--color-text-secondary)',
  },
  running: {
    label: 'Running',
    dot: 'var(--color-accent)',
    bg: 'var(--color-accent-muted)',
    ink: 'var(--color-accent)',
  },
  paused: {
    label: 'Paused',
    dot: 'var(--color-text-yellow)',
    bg: 'var(--color-warning-muted)',
    ink: 'var(--color-text-yellow)',
  },
  success: {
    label: 'Success',
    dot: 'var(--color-text-green)',
    bg: 'var(--color-success-muted)',
    ink: 'var(--color-text-green)',
  },
  failed: {
    label: 'Failed',
    dot: 'var(--color-text-red)',
    bg: 'var(--color-error-muted)',
    ink: 'var(--color-text-red)',
  },
  tripwire: {
    label: 'Tripwire',
    dot: 'var(--color-text-blue)',
    bg: 'var(--color-background-blue)',
    ink: 'var(--color-text-blue)',
  },
  canceled: {
    label: 'Canceled',
    dot: 'var(--color-text-secondary)',
    bg: 'var(--color-background-surface)',
    ink: 'var(--color-text-secondary)',
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
