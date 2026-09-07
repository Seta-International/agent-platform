import { describe, expect, it } from 'vitest';
import {
  GenericResumeBody,
  parseResumeBodyForWorkflow,
} from '../../../src/backend/routes/resume-body.ts';

const APPROVAL_ID = 'f0c1a2b3-4d5e-4f60-8123-456789abcdef';

describe('resume body schemas', () => {
  it('accepts a well-formed generic body', () => {
    expect(
      GenericResumeBody.safeParse({ approvalId: APPROVAL_ID, chosen: 'primary' }).success,
    ).toBe(true);
  });

  it('REJECTS an unknown key rather than stripping it', () => {
    expect(
      GenericResumeBody.safeParse({
        approvalId: APPROVAL_ID,
        chosen: 'primary',
        taskId: 'smuggled',
        patch: { title: 'Smuggled' },
        overrideUserIds: ['attacker'],
      }).success,
    ).toBe(false);
  });

  it('requires alternateIndex when chosen is "alternate"', () => {
    expect(
      GenericResumeBody.safeParse({ approvalId: APPROVAL_ID, chosen: 'alternate' }).success,
    ).toBe(false);
  });

  it('forbids alternateIndex when chosen is not "alternate"', () => {
    expect(
      GenericResumeBody.safeParse({ approvalId: APPROVAL_ID, chosen: 'primary', alternateIndex: 0 })
        .success,
    ).toBe(false);
  });

  it('caps note length — it is audit metadata, not a payload', () => {
    expect(
      GenericResumeBody.safeParse({
        approvalId: APPROVAL_ID,
        chosen: 'decline',
        note: 'x'.repeat(1001),
      }).success,
    ).toBe(false);
  });
});

describe('parseResumeBodyForWorkflow', () => {
  it('rejects a legacy body against an A2 card', () => {
    expect(() =>
      parseResumeBodyForWorkflow('planner.action', {
        approvalId: APPROVAL_ID,
        decision: 'approve',
        overrideUserIds: ['u1'],
      }),
    ).toThrow(/validation_failed/);
  });

  it('returns the parsed generic body for an A2 card', () => {
    expect(
      parseResumeBodyForWorkflow('planner.action', { approvalId: APPROVAL_ID, chosen: 'decline' }),
    ).toEqual({ kind: 'generic', body: { approvalId: APPROVAL_ID, chosen: 'decline' } });
  });

  it('rejects an unknown workflow id', () => {
    expect(() =>
      parseResumeBodyForWorkflow('something.else', { approvalId: APPROVAL_ID, chosen: 'primary' }),
    ).toThrow(/not_supported/);
  });
});

describe('parseResumeBodyForWorkflow — one contract for both chat runtimes', () => {
  const ASSIGNMENT = 'planner.assignment-orchestrator';

  it('parses the assignment id with the generic body', () => {
    const parsed = parseResumeBodyForWorkflow(ASSIGNMENT, {
      approvalId: APPROVAL_ID,
      chosen: 'alternate',
      alternateIndex: 1,
    });
    expect(parsed.kind).toBe('generic');
  });

  // strictObject, not object: a stale client's body must be REFUSED, not
  // silently stripped and answered 200 (FUT-804 AC5).
  it('refuses a legacy body against the assignment id', () => {
    expect(() =>
      parseResumeBodyForWorkflow(ASSIGNMENT, {
        approvalId: APPROVAL_ID,
        decision: 'modify',
        overrideUserIds: ['u2'],
      }),
    ).toThrow(/validation_failed/);
  });

  it('refuses a smuggled overrideUserIds beside a valid chosen', () => {
    expect(() =>
      parseResumeBodyForWorkflow(ASSIGNMENT, {
        approvalId: APPROVAL_ID,
        chosen: 'primary',
        overrideUserIds: ['u2'],
      }),
    ).toThrow(/validation_failed/);
  });

  it('still refuses an unknown workflow id', () => {
    expect(() =>
      parseResumeBodyForWorkflow('planner.assignBySkill', {
        approvalId: APPROVAL_ID,
        chosen: 'primary',
      }),
    ).toThrow(/not_supported/);
  });
});
