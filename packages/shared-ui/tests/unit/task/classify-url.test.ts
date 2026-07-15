import { describe, expect, it } from 'vitest';
import { classifyUrl } from '../../../src/task/classify-url';

describe('classifyUrl', () => {
  it('classifies an .xlsx SharePoint URL as excel with the file alias', () => {
    expect(classifyUrl('https://acme.sharepoint.com/Shared/Doc.xlsx')).toEqual({
      url: 'https://acme.sharepoint.com/Shared/Doc.xlsx',
      type: 'excel',
      alias: 'Doc.xlsx',
      host: 'acme.sharepoint.com',
    });
  });
  it('infers word/.docx, powerPoint/.pptx, web otherwise', () => {
    expect(classifyUrl('https://x/y.docx')?.type).toBe('word');
    expect(classifyUrl('https://x/y.pptx')?.type).toBe('powerPoint');
    expect(classifyUrl('https://x/y')?.type).toBe('web');
  });
  it('classifies an extensionless SharePoint URL as sharePoint', () => {
    expect(classifyUrl('https://acme.sharepoint.com/sites/Engineering')?.type).toBe('sharePoint');
  });
  it('returns null when the input is not a URL', () => {
    expect(classifyUrl('not a url')).toBeNull();
  });
});
