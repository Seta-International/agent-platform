import { describe, expect, it } from 'vitest';
import { PEOPLE_EVENTS, workerCreatedPayload } from '../../src/events.ts';

describe('people events', () => {
  it('registers people.worker.created', () => {
    expect(Object.keys(PEOPLE_EVENTS)).toContain('people.worker.created');
  });

  it('validates the worker.created payload', () => {
    const parsed = workerCreatedPayload.safeParse({
      worker_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      full_name: 'Alice Example',
      job_title: null,
    });
    expect(parsed.success).toBe(true);
  });
});
