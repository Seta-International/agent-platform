import { describe, expect, it } from 'vitest';
import { projectFilterKey } from '../../src/components/people-filter-bar.tsx';

describe('projectFilterKey', () => {
  it('includes the account scope so the tokenizer remounts on account change', () => {
    const before = projectFilterKey(['a1'], ['p1']);
    const after = projectFilterKey(['a2'], ['p1']);
    expect(before).not.toBe(after);
  });

  it('changes when the project selection changes', () => {
    const before = projectFilterKey(['a1'], []);
    const after = projectFilterKey(['a1'], ['p1']);
    expect(before).not.toBe(after);
  });

  it('is stable when neither account nor project changes', () => {
    expect(projectFilterKey(['a1'], ['p1'])).toBe(projectFilterKey(['a1'], ['p1']));
  });
});
