import { describe, expect, it } from 'vitest';
import { cleanThreadTitle } from '../../src/backend/thread-title.ts';

describe('cleanThreadTitle', () => {
  it('trims whitespace and collapses newlines to a single line', () => {
    expect(cleanThreadTitle('  Find AWS engineers\n for the task  ', 'fallback')).toBe(
      'Find AWS engineers for the task',
    );
  });

  it('strips wrapping quotes the model sometimes adds', () => {
    expect(cleanThreadTitle('"Onboarding plan"', 'fallback')).toBe('Onboarding plan');
    expect(cleanThreadTitle("'Onboarding plan'", 'fallback')).toBe('Onboarding plan');
  });

  it('caps the title at 80 characters', () => {
    const long = 'a'.repeat(200);
    expect(cleanThreadTitle(long, 'fallback')).toHaveLength(80);
  });

  it('falls back when the model returns empty or whitespace', () => {
    expect(cleanThreadTitle('', 'My fallback')).toBe('My fallback');
    expect(cleanThreadTitle('   \n  ', 'My fallback')).toBe('My fallback');
  });

  it('strips residual <think> blocks defensively', () => {
    expect(cleanThreadTitle('<think>hmm</think>Budget review', 'fallback')).toBe('Budget review');
  });
});
