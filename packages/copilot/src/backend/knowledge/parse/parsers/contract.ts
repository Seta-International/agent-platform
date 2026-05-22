export interface ParsedSection {
  text: string;
  page_hint: string | null; // e.g. "p.3", "Sheet1!A1:Z100", null
}

export interface ParsedDocument {
  sections: ParsedSection[];
}

export interface Parser {
  parse(buffer: Buffer): Promise<ParsedDocument>;
}
