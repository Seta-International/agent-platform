import * as XLSX from 'xlsx';
import type { ParsedDocument, Parser } from './contract.ts';

export const xlsxParser: Parser = {
  async parse(buffer: Buffer): Promise<ParsedDocument> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sections = wb.SheetNames.map((sheetName) => {
      const sheet = wb.Sheets[sheetName]!;
      const csv = XLSX.utils.sheet_to_csv(sheet);
      return { text: csv.trim(), page_hint: sheetName };
    }).filter((s) => s.text.length > 0);
    return { sections };
  },
};
