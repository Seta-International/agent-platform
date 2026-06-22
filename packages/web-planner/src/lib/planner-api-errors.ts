/** Matches `createTaskSchema.title` in packages/planner/src/backend/http/tasks.ts */
export const TASK_TITLE_MAX_LENGTH = 255;

export const TASK_TITLE_TOO_LONG_MESSAGE = `Task title cannot exceed ${TASK_TITLE_MAX_LENGTH} characters.`;

/** Matches `createBucketSchema.name` in packages/planner/src/backend/http/buckets.ts */
export const BUCKET_NAME_MAX_LENGTH = 120;

export const BUCKET_NAME_TOO_LONG_MESSAGE = `Bucket name cannot exceed ${BUCKET_NAME_MAX_LENGTH} characters.`;

type PlannerErrorBody = {
  error?: string;
  message?: string;
  details?: {
    fieldErrors?: Record<string, string[]>;
  };
};

export class PlannerValidationError extends Error {
  readonly fieldErrors: Record<string, string[]>;

  constructor(message: string, fieldErrors: Record<string, string[]>) {
    super(message);
    this.name = 'PlannerValidationError';
    this.fieldErrors = fieldErrors;
  }
}

function friendlyTitleError(raw: string): string {
  if (raw.includes('<=255') || raw.toLowerCase().includes('too big')) {
    return TASK_TITLE_TOO_LONG_MESSAGE;
  }
  return raw;
}

function friendlyNameError(raw: string): string {
  if (raw.includes('<=120') || raw.toLowerCase().includes('too big')) {
    return BUCKET_NAME_TOO_LONG_MESSAGE;
  }
  return raw;
}

function friendlyFieldErrors(fieldErrors: Record<string, string[]>): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (field === 'title') next[field] = messages.map(friendlyTitleError);
    else if (field === 'name') next[field] = messages.map(friendlyNameError);
    else next[field] = [...messages];
  }
  return next;
}

/** Build a throw-able error from a non-OK planner API response body. */
export function errorFromPlannerResponse(status: number, body: PlannerErrorBody): Error {
  const fieldErrors = body.details?.fieldErrors;
  if (fieldErrors && Object.keys(fieldErrors).length > 0) {
    const friendly = friendlyFieldErrors(fieldErrors);
    const message =
      friendly.title?.[0] ??
      friendly.name?.[0] ??
      Object.values(friendly)[0]?.[0] ??
      body.message ??
      `Request failed (${status})`;
    return new PlannerValidationError(message, friendly);
  }
  return new Error(body.message ?? `Request failed (${status})`);
}
