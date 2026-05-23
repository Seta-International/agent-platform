import mammoth from 'mammoth';
import type { ParsedDocument, Parser } from './contract.ts';

export const docxParser: Parser = {
  async parse(buffer: Buffer): Promise<ParsedDocument> {
    const { value } = await mammoth.extractRawText({ buffer });
    return {
      sections: [{ text: value.trim(), page_hint: null }],
    };
  },
};
