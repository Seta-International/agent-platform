import { describe, expect, it } from 'vitest';
import { textParser } from '../text.ts';

describe('textParser', () => {
  it('returns one section for plain text', async () => {
    const buf = Buffer.from('Hello world\nSecond line');
    const doc = await textParser.parse(buf);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]?.page_hint).toBeNull();
    expect(doc.sections[0]?.text).toContain('Hello world');
  });

  it('returns one section for markdown content', async () => {
    const buf = Buffer.from('# Title\n\nParagraph text here.');
    const doc = await textParser.parse(buf);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]?.text).toContain('# Title');
  });
});
