import type { ParsedDocument, Parser } from './contract.ts';

export const textParser: Parser = {
  async parse(buffer: Buffer): Promise<ParsedDocument> {
    return {
      sections: [{ text: buffer.toString('utf-8').trim(), page_hint: null }],
    };
  },
};
