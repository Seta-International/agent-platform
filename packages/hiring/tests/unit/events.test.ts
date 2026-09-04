import { describe, expect, it } from 'vitest';
import {
  HIRING_APPLICATION_CREATED,
  HIRING_APPLICATION_REJECTED,
  HIRING_APPLICATION_STAGE_CHANGED,
  HIRING_APPLICATION_TRANSFERRED,
  HIRING_APPLICATION_UPDATED,
  HIRING_CANDIDATE_ADDED,
  HIRING_CANDIDATE_UPDATED,
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
    expect(Object.keys(HIRING_EVENTS)).toHaveLength(17);
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

describe('hiring events (HIR-6/7 candidates + applications)', () => {
  it('declares all 7 new events in HIRING_EVENTS', () => {
    for (const key of [
      HIRING_CANDIDATE_ADDED,
      HIRING_CANDIDATE_UPDATED,
      HIRING_APPLICATION_CREATED,
      HIRING_APPLICATION_UPDATED,
      HIRING_APPLICATION_STAGE_CHANGED,
      HIRING_APPLICATION_REJECTED,
      HIRING_APPLICATION_TRANSFERRED,
    ]) {
      expect(HIRING_EVENTS[key as keyof typeof HIRING_EVENTS], `missing key: ${key}`).toBeDefined();
    }
    expect(Object.keys(HIRING_EVENTS)).toHaveLength(17);
  });

  it('candidate.added payload validates', () => {
    const ok = HIRING_EVENTS[HIRING_CANDIDATE_ADDED].safeParse({
      candidate_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
    });
    expect(ok.success).toBe(true);
  });

  it('candidate.updated payload validates with fields array', () => {
    const ok = HIRING_EVENTS[HIRING_CANDIDATE_UPDATED].safeParse({
      candidate_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      fields: ['first_name', 'email'],
    });
    expect(ok.success).toBe(true);
  });

  it('application.created payload validates', () => {
    const ok = HIRING_EVENTS[HIRING_APPLICATION_CREATED].safeParse({
      application_id: crypto.randomUUID(),
      candidate_id: crypto.randomUUID(),
      requisition_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
    });
    expect(ok.success).toBe(true);
  });

  it('application.updated payload validates with fields array', () => {
    const ok = HIRING_EVENTS[HIRING_APPLICATION_UPDATED].safeParse({
      application_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      fields: ['stage_id'],
    });
    expect(ok.success).toBe(true);
  });

  it('application.stage_changed payload validates', () => {
    const ok = HIRING_EVENTS[HIRING_APPLICATION_STAGE_CHANGED].safeParse({
      application_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      from: 'screening',
      to: 'interview',
    });
    expect(ok.success).toBe(true);
  });

  it('declares the rejected event with a category', () => {
    const schema = HIRING_EVENTS[HIRING_APPLICATION_REJECTED];
    expect(
      schema.safeParse({
        application_id: crypto.randomUUID(),
        tenant_id: crypto.randomUUID(),
        reason_id: crypto.randomUUID(),
        category: 'rejected_by_us',
      }).success,
    ).toBe(true);
  });

  it('application.rejected rejects an invalid category', () => {
    const schema = HIRING_EVENTS[HIRING_APPLICATION_REJECTED];
    expect(
      schema.safeParse({
        application_id: crypto.randomUUID(),
        tenant_id: crypto.randomUUID(),
        reason_id: crypto.randomUUID(),
        category: 'not_a_valid_category',
      }).success,
    ).toBe(false);
  });

  it('application.transferred payload validates', () => {
    const ok = HIRING_EVENTS[HIRING_APPLICATION_TRANSFERRED].safeParse({
      application_id: crypto.randomUUID(),
      to_application_id: crypto.randomUUID(),
      target_requisition_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
    });
    expect(ok.success).toBe(true);
  });
});
