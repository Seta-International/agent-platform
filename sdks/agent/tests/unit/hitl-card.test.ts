import { describe, expect, it } from 'vitest';
import { ApprovalDetailBlockSchema } from '../../src/hitl/card.ts';

describe('HITL block DSL', () => {
  it('accepts an entityList block with multi-select', () => {
    const block = {
      kind: 'entityList',
      select: 'multi',
      items: [
        { id: 'u1', type: 'user', label: 'Alice', secondary: 'aws', score: 0.8, primary: true },
      ],
    };
    // Zod applies the `select` default only when the field is absent; since we
    // pass 'multi' explicitly the parsed output equals the input.
    expect(ApprovalDetailBlockSchema.parse(block)).toEqual(block);
  });

  it('applies the default select=none when select is omitted', () => {
    const parsed = ApprovalDetailBlockSchema.parse({
      kind: 'entityList',
      items: [{ id: 'u2', type: 'task', label: 'Deploy' }],
    });
    expect(parsed).toMatchObject({ kind: 'entityList', select: 'none' });
  });

  it('accepts a confidence block and a citations block', () => {
    expect(ApprovalDetailBlockSchema.parse({ kind: 'confidence', score: 0.9 }).kind).toBe(
      'confidence',
    );
    expect(
      ApprovalDetailBlockSchema.parse({
        kind: 'citations',
        items: [{ kind: 'task', id: 't1', label: 'Infra' }],
      }).kind,
    ).toBe('citations');
  });
});
