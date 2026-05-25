import { assertNoSessionField } from '@seta/copilot-sdk';
import { describe, expect, it } from 'vitest';
import {
  dedupOnCreateWorkflow,
  dedupOnCreateWorkflowSpec,
} from '../../../../src/backend/workflows/dedup-on-create/spec.ts';

describe('dedupOnCreate workflow — registration shape', () => {
  it('exposes id "dedupOnCreate"', () => {
    expect(dedupOnCreateWorkflowSpec.id).toBe('dedupOnCreate');
    expect(dedupOnCreateWorkflow).toBeDefined();
  });

  it('inputSchema has NO session field (auth-design rule, enforced at register time)', () => {
    expect(() =>
      assertNoSessionField(dedupOnCreateWorkflowSpec.inputSchema, 'dedupOnCreate'),
    ).not.toThrow();
  });

  it('declares hitlSteps = ["dedupOnCreate.decide"]', () => {
    expect(dedupOnCreateWorkflowSpec.hitlSteps).toEqual(['dedupOnCreate.decide']);
  });

  it('no longer pins to the always-cancelled stub step id', () => {
    expect(dedupOnCreateWorkflowSpec.hitlSteps?.[0]).not.toBe('dedupOnCreate.run');
  });
});
