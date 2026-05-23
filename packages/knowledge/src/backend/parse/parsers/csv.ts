import type { ParsedDocument, Parser } from './contract.ts';

export const csvParser: Parser = {
  async parse(buffer: Buffer): Promise<ParsedDocument> {
    // CSV is already plain text — let the recursive chunker split it by line.
    return {
      sections: [{ text: buffer.toString('utf-8').trim(), page_hint: null }],
    };
  },
};
