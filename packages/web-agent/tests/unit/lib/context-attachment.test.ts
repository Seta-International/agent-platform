import { describe, expect, it } from 'vitest';
import { parseContextAttachment } from '../../../src/lib/context-attachment';

describe('parseContextAttachment', () => {
  it('extracts filenames from a Context sentinel text part', () => {
    const text =
      'Context:\n<<<FILE: spec.pdf>>>\nBODY\n<<<END spec.pdf>>>\n\n<<<FILE: data.csv>>>\nx\n<<<END data.csv>>>';
    expect(parseContextAttachment(text)).toEqual(['spec.pdf', 'data.csv']);
  });
  it('returns null for normal text', () => {
    expect(parseContextAttachment('what is the weather?')).toBeNull();
  });

  it('ignores a `<<<FILE:` a user literally typed in an ordinary message', () => {
    // Only a real attachment prefixes the whole part with `Context:\n<<<FILE:`.
    expect(parseContextAttachment('what does <<<FILE: mean in this codebase?')).toBeNull();
    expect(parseContextAttachment('<<<FILE: not a real attachment >>>')).toBeNull();
  });

  it('returns null when the sentinel carries no usable filename', () => {
    expect(parseContextAttachment('Context:\n<<<FILE:>>>')).toBeNull();
    expect(parseContextAttachment('Context:\n<<<FILE:   >>>')).toBeNull();
  });

  it('is defensive against non-string input', () => {
    expect(parseContextAttachment(undefined as unknown as string)).toBeNull();
    expect(parseContextAttachment(null as unknown as string)).toBeNull();
  });

  it('trims surrounding whitespace from extracted names', () => {
    expect(parseContextAttachment('Context:\n<<<FILE:   spec.pdf   >>>')).toEqual(['spec.pdf']);
  });
});
