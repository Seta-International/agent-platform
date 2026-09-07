import { describe, expect, it } from 'vitest';
import { NOTE_PREVIEW_CHARS, previewOf } from '../../../src/pages/morale-labels.ts';

describe('previewOf (FUT-786)', () => {
  it('leaves a note that already fits alone', () => {
    const short = 'Handover went well.';

    expect(previewOf(short)).toEqual({ shown: short, isTruncated: false });
  });

  it('does not leave the sentence it cut at ending in its own full stop', () => {
    // The word boundary the cut lands on is often the one after a full stop, and the
    // caller appends an ellipsis — so without this the row reads "…quietly wrong…. + more",
    // four dots that look like a rendering fault rather than a truncation.
    const text = `${'word '.repeat(34)}quietly wrong. Nobody has said no to the extra work.`;
    const { shown, isTruncated } = previewOf(text);

    expect(isTruncated).toBe(true);
    expect(shown.endsWith('.')).toBe(false);
    expect(shown.endsWith(' ')).toBe(false);
    expect(shown.length).toBeLessThanOrEqual(NOTE_PREVIEW_CHARS);
  });
});
