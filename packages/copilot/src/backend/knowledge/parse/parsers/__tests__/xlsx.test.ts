import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { xlsxParser } from '../xlsx.ts';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

beforeAll(() => {
  mkdirSync(FIXTURES, { recursive: true });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['name', 'role'],
    ['Alice', 'terraform'],
    ['Bob', 'react'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  writeFileSync(resolve(FIXTURES, 'small.xlsx'), buf);
});

describe('xlsxParser', () => {
  it('extracts one section per sheet with sheet name as page_hint', async () => {
    const buf = await readFile(resolve(FIXTURES, 'small.xlsx'));
    const doc = await xlsxParser.parse(buf);
    expect(doc.sections.length).toBeGreaterThanOrEqual(1);
    expect(doc.sections[0]?.page_hint).toMatch(/^Sheet[^.]+/);
  });
});
