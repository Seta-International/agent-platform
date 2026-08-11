import { describe, expect, it } from 'vitest';
import { buildTenantKey } from '../../src/tenant-key.ts';

describe('buildTenantKey', () => {
  it('produces a tenant-scoped key path', () => {
    const key = buildTenantKey({
      tenant_id: '00000000-0000-0000-0000-000000000001',
      domain: 'knowledge',
      file_id: 'abc123',
      filename: 'handbook.pdf',
    });
    expect(key).toBe('tenants/00000000-0000-0000-0000-000000000001/knowledge/abc123/handbook.pdf');
  });

  it('sanitizes filenames — strips directory separators', () => {
    const key = buildTenantKey({
      tenant_id: 't',
      domain: 'knowledge',
      file_id: 'f',
      filename: '../../evil.pdf',
    });
    expect(key).not.toContain('../');
    expect(key.endsWith('evil.pdf')).toBe(true);
  });

  it('supports the CV domains for hiring and people', () => {
    expect(
      buildTenantKey({ tenant_id: 't1', domain: 'hiring-cv', file_id: 'c1', filename: 'cv.pdf' }),
    ).toBe('tenants/t1/hiring-cv/c1/cv.pdf');
    expect(
      buildTenantKey({ tenant_id: 't1', domain: 'people-cv', file_id: 'w1', filename: 'cv.docx' }),
    ).toBe('tenants/t1/people-cv/w1/cv.docx');
  });

  it('supports the people-photo domain', () => {
    expect(
      buildTenantKey({
        tenant_id: 't1',
        domain: 'people-photo',
        file_id: 'p1',
        filename: 'avatar.jpg',
      }),
    ).toBe('tenants/t1/people-photo/p1/avatar.jpg');
  });

  it('throws when filename is empty', () => {
    expect(() =>
      buildTenantKey({
        tenant_id: 't',
        domain: 'knowledge',
        file_id: 'f',
        filename: '',
      }),
    ).toThrow(/filename/);
  });
});
