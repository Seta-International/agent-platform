import { describe, expect, it } from 'vitest';
import {
  classifyRow,
  deriveEmail,
  stripDiacritics,
} from '../../src/commands/lib/employee-fixtures.ts';

describe('stripDiacritics', () => {
  it('strips Vietnamese marks', () => {
    expect(stripDiacritics('Vũ Thanh Hùng')).toBe('Vu Thanh Hung');
  });
});

describe('deriveEmail', () => {
  it('builds {given}.{family+middle}@seta-international.vn', () => {
    expect(deriveEmail('Vũ Thanh Hùng', 6276, new Set())).toBe(
      'hung.vuthanh@seta-international.vn',
    );
  });
  it('appends id on collision', () => {
    const taken = new Set(['hung.vuthanh@seta-international.vn']);
    expect(deriveEmail('Vũ Thanh Hùng', 6276, taken)).toBe(
      'hung.vuthanh.6276@seta-international.vn',
    );
  });
});

describe('classifyRow', () => {
  it('detects a project header (project+code, no id/name)', () => {
    const r = [2, null, null, null, 'JetX', 'STP007', null, null, 77, 4, 3.5];
    expect(classifyRow(r)).toEqual({ kind: 'header', project: 'JetX', code: 'STP007' });
  });
  it('detects a member row', () => {
    const r = [1, 6862, 'Nguyễn Duy Đạt', 'DEV', 'JetX', null, 622, 22, 22, 1, 1];
    expect(classifyRow(r)).toMatchObject({
      kind: 'member',
      id: '6862',
      name: 'Nguyễn Duy Đạt',
      role: 'DEV',
      ratio: 1,
    });
  });
  it('skips totals rows', () => {
    const r = [null, null, 'Total alls', null, null, 'Total alls', null, null, 3326, 169, 151];
    expect(classifyRow(r)).toEqual({ kind: 'skip' });
  });
});
