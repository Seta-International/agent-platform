import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { pdfParser } from '../pdf.ts';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

// Minimal valid 2-page PDF generated offline (Node script, exact byte offsets).
// Pages contain "Page 1" and "Page 2" respectively.
const SMALL_PDF_B64 =
  'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PCAvTGVuZ3RoIDM3ID4+CnN0cmVhbQpCVCAvRjEgMTIg' +
  'VGYgNzIgNzIwIFRkIChQYWdlIDEpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKMiAwIG9iago8PCAv' +
  'TGVuZ3RoIDM3ID4+CnN0cmVhbQpCVCAvRjEgMTIgVGYgNzIgNzIwIFRkIChQYWdlIDIpIFRqIEVU' +
  'CmVuZHN0cmVhbQplbmRvYmoKMyAwIG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDQgMCBSIC9N' +
  'ZWRpYUJveCBbMCAwIDYxMiA3OTJdIC9Db250ZW50cyAxIDAgUiAvUmVzb3VyY2VzIDw8IC9Gb250' +
  'IDw8IC9GMSA8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRp' +
  'Y2EgPj4gPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCA1IDAg' +
  'UiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgMiAwIFIgL1Jlc291cmNlcyA8PCAv' +
  'Rm9udCA8PCAvRjEgPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVs' +
  'dmV0aWNhID4+ID4+ID4+ID4+CmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9QYWdlcyAvS2lkcyBb' +
  'MyAwIFIgNCAwIFJdIC9Db3VudCAyID4+CmVuZG9iago2IDAgb2JqCjw8IC9UeXBlIC9DYXRhbG9n' +
  'IC9QYWdlcyA1IDAgUiA+PgplbmRvYmoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAw' +
  'MDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAxMDIgMDAwMDAgbiAKMDAwMDAwMDE4OSAwMDAwMCBuIAow' +
  'MDAwMDAwMzY0IDAwMDAwIG4gCjAwMDAwMDA1MzkgMDAwMDAgbiAKMDAwMDAwMDYwMiAwMDAwMCBu' +
  'IAp0cmFpbGVyCjw8IC9TaXplIDcgL1Jvb3QgNiAwIFIgPj4Kc3RhcnR4cmVmCjY1MQolJUVPRgo=';

beforeAll(() => {
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(resolve(FIXTURES, 'small.pdf'), Buffer.from(SMALL_PDF_B64, 'base64'));
});

describe('pdfParser', () => {
  it('extracts text from a small PDF with per-page hints', async () => {
    const buf = await readFile(resolve(FIXTURES, 'small.pdf'));
    const doc = await pdfParser.parse(buf);
    expect(doc.sections.length).toBeGreaterThan(0);
    expect(doc.sections[0]?.page_hint).toBe('p.1');
  });
});
