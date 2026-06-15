import { z } from 'zod';

export const EVALUATION_RUN_CREATED = 'evaluation.run.created' as const;
export const EVALUATION_RUN_CREATED_VERSION = 1 as const;

export interface EvaluationRunCreatedPayload {
  tenant_id: string;
  run_id: string;
  dataset_id: string;
}

export const EVALUATION_RUN_CREATED_PAYLOAD = z.object({
  tenant_id: z.string(),
  run_id: z.string(),
  dataset_id: z.string(),
});

export const EVALUATION_RUN_COMPLETED = 'evaluation.run.completed' as const;
export const EVALUATION_RUN_COMPLETED_VERSION = 1 as const;

export interface EvaluationRunCompletedPayload {
  tenant_id: string;
  run_id: string;
  dataset_id: string;
  summary: unknown;
}

export const EVALUATION_RUN_COMPLETED_PAYLOAD = z.object({
  tenant_id: z.string(),
  run_id: z.string(),
  dataset_id: z.string(),
  summary: z.unknown(),
});

export const EVALUATION_RUN_FAILED = 'evaluation.run.failed' as const;
export const EVALUATION_RUN_FAILED_VERSION = 1 as const;

export interface EvaluationRunFailedPayload {
  tenant_id: string;
  run_id: string;
  dataset_id: string;
  error: string;
}

export const EVALUATION_RUN_FAILED_PAYLOAD = z.object({
  tenant_id: z.string(),
  run_id: z.string(),
  dataset_id: z.string(),
  error: z.string(),
});

export const EVALUATION_EVENTS = {
  [EVALUATION_RUN_CREATED]: EVALUATION_RUN_CREATED_PAYLOAD,
  [EVALUATION_RUN_COMPLETED]: EVALUATION_RUN_COMPLETED_PAYLOAD,
  [EVALUATION_RUN_FAILED]: EVALUATION_RUN_FAILED_PAYLOAD,
} as const;
