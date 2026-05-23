import { describe, expect, it } from 'vitest';
import { csvParser } from '../csv.ts';

describe('csvParser', () => {
  it('returns one section with the CSV text (chunker handles split)', async () => {
    const buf = Buffer.from('name,role\nAlice,terraform\nBob,react\n');
    const doc = await csvParser.parse(buf);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]?.text).toContain('Alice,terraform');
  });
});
