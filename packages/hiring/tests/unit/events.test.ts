import { describe, expect, it } from 'vitest';
import {
  HIRING_EVENTS,
  HIRING_OPENING_CLOSED,
  HIRING_OPENING_OPENED,
  HIRING_REQUISITION_CLOSED,
  HIRING_REQUISITION_OPENED,
  HIRING_REQUISITION_UPDATED,
} from '../../src/events.ts';

describe('hiring events', () => {
  it('declares hiring.requisition.opened with a valid payload schema', () => {
    expect(HIRING_EVENTS[HIRING_REQUISITION_OPENED]).toBeDefined();
    const parsed = HIRING_EVENTS[HIRING_REQUISITION_OPENED].safeParse({
      requisition_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
    });
    expect(parsed.success).toBe(true);
  });
});

describe('hiring events (HIR-2)', () => {
  it('declares the five HIR-2 events', () => {
    for (const t of [
      'hiring.requisition.opened',
      HIRING_REQUISITION_UPDATED,
      HIRING_REQUISITION_CLOSED,
      HIRING_OPENING_OPENED,
      HIRING_OPENING_CLOSED,
    ] as const) {
      expect(HIRING_EVENTS[t]).toBeDefined();
    }
    expect(Object.keys(HIRING_EVENTS)).toHaveLength(5);
  });
  it('opening.opened payload validates', () => {
    const ok = HIRING_EVENTS[HIRING_OPENING_OPENED].safeParse({
      opening_id: crypto.randomUUID(),
      requisition_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
    });
    expect(ok.success).toBe(true);
  });
});
