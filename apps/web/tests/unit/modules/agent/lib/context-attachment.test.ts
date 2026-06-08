import { describe, expect, it } from 'vitest';
import { parseContextAttachment } from '@/modules/agent/lib/context-attachment';

describe('parseContextAttachment', () => {
  it('extracts filenames from a Context sentinel text part', () => {
    const text =
      'Context:\n<<<FILE: spec.pdf>>>\nBODY\n<<<END spec.pdf>>>\n\n<<<FILE: data.csv>>>\nx\n<<<END data.csv>>>';
    expect(parseContextAttachment(text)).toEqual(['spec.pdf', 'data.csv']);
  });
  it('returns null for normal text', () => {
    expect(parseContextAttachment('what is the weather?')).toBeNull();
  });
});
