import { describe, expect, it } from 'vitest';
import { HIRING_EVENTS, HIRING_REQUISITION_OPENED } from '../../src/events.ts';

describe('hiring events', () => {
  it('declares only hiring.requisition.opened with a valid payload schema', () => {
    expect(Object.keys(HIRING_EVENTS)).toEqual([HIRING_REQUISITION_OPENED]);
    const parsed = HIRING_EVENTS[HIRING_REQUISITION_OPENED].safeParse({
      requisition_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
    });
    expect(parsed.success).toBe(true);
  });
});
