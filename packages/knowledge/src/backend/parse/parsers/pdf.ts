import { extractText, getDocumentProxy } from 'unpdf';
import type { ParsedDocument, Parser } from './contract.ts';

export const pdfParser: Parser = {
  async parse(buffer: Buffer): Promise<ParsedDocument> {
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(doc, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    return {
      sections: pages
        .map((page, i) => ({
          text: page.trim(),
          page_hint: `p.${i + 1}`,
        }))
        .filter((s) => s.text.length > 0),
    };
  },
};
