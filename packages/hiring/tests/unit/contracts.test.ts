import { describe, expect, it } from 'vitest';
import {
  addCandidateInput,
  closeOpeningInput,
  editCandidatePatch,
  editRequisitionPatch,
  openRequisitionInput,
  rejectApplicationInput,
} from '../../src/contracts.ts';

describe('hiring contracts (HIR-2)', () => {
  it('openRequisitionInput defaults headcount to 1 and accepts jd_sections + skills', () => {
    const p = openRequisitionInput.parse({
      title: 'Senior Backend Engineer',
      kind: 'new',
      jd_sections: [{ variant: 'external', section: 'about', body: '<p>hi</p>' }],
      skills: [{ skill_id: crypto.randomUUID(), skill_name: 'Go', min_level: 4 }],
    });
    expect(p.headcount).toBe(1);
    expect(p.skills?.[0]?.skill_name).toBe('Go');
  });
  it('openRequisitionInput validates headcount bounds (1 <= headcount <= 9)', () => {
    expect(openRequisitionInput.safeParse({ title: 'Dev', headcount: 0 }).success).toBe(false);
    expect(openRequisitionInput.safeParse({ title: 'Dev', headcount: -5 }).success).toBe(false);
    expect(openRequisitionInput.safeParse({ title: 'Dev', headcount: 1.5 }).success).toBe(false);
    expect(openRequisitionInput.safeParse({ title: 'Dev', headcount: 10 }).success).toBe(false);
    expect(openRequisitionInput.safeParse({ title: 'Dev', headcount: 9 }).success).toBe(true);
    expect(openRequisitionInput.safeParse({ title: 'Dev', headcount: 1 }).success).toBe(true);
  });
  it('editRequisitionPatch rejects an unknown status value via stage enum', () => {
    expect(editRequisitionPatch.safeParse({ stage: 'bogus' }).success).toBe(false);
  });
  it('closeOpeningInput requires a valid status', () => {
    expect(closeOpeningInput.safeParse({ status: 'open' }).success).toBe(false);
    expect(closeOpeningInput.safeParse({ status: 'closed' }).success).toBe(true);
  });
  it('requires a requisition and a name to add a candidate', () => {
    expect(
      addCandidateInput.safeParse({ name: 'A', requisition_id: crypto.randomUUID() }).success,
    ).toBe(true);
    expect(addCandidateInput.safeParse({ name: 'A' }).success).toBe(false);
  });
  it('requires a free-text reason to reject; the catalog id is optional', () => {
    expect(rejectApplicationInput.safeParse({ reason: 'Not a fit', tags: [] }).success).toBe(true);
    expect(
      rejectApplicationInput.safeParse({
        reason: 'Not a fit',
        reason_id: crypto.randomUUID(),
        tags: [],
      }).success,
    ).toBe(true);
    expect(rejectApplicationInput.safeParse({ tags: [] }).success).toBe(false);
    expect(rejectApplicationInput.safeParse({ reason: '   ', tags: [] }).success).toBe(false);
  });
  describe('name validation (FUT-623)', () => {
    const validReq = () => ({ requisition_id: crypto.randomUUID() });
    it('rejects date-like values', () => {
      expect(addCandidateInput.safeParse({ name: '12-12-1992', ...validReq() }).success).toBe(
        false,
      );
    });
    it('rejects numeric-only values', () => {
      expect(addCandidateInput.safeParse({ name: '12345', ...validReq() }).success).toBe(false);
    });
    it('rejects symbol-only values', () => {
      expect(addCandidateInput.safeParse({ name: '!!!', ...validReq() }).success).toBe(false);
    });
    it('rejects emoji values', () => {
      expect(addCandidateInput.safeParse({ name: 'Nguyễn Văn A 😀', ...validReq() }).success).toBe(
        false,
      );
      expect(addCandidateInput.safeParse({ name: '😀', ...validReq() }).success).toBe(false);
    });
    it('accepts valid Vietnamese name', () => {
      expect(addCandidateInput.safeParse({ name: 'Nguyễn Văn A', ...validReq() }).success).toBe(
        true,
      );
    });
    it('accepts hyphenated Western name', () => {
      expect(addCandidateInput.safeParse({ name: 'Jean-Claude', ...validReq() }).success).toBe(
        true,
      );
    });
    it('accepts name with apostrophe', () => {
      expect(addCandidateInput.safeParse({ name: "O'Connor", ...validReq() }).success).toBe(true);
    });
    it('accepts CJK characters', () => {
      expect(addCandidateInput.safeParse({ name: '玛丽', ...validReq() }).success).toBe(true);
    });
    it('accepts single character', () => {
      expect(addCandidateInput.safeParse({ name: 'A', ...validReq() }).success).toBe(true);
    });
    it('rejects over 100 characters', () => {
      expect(addCandidateInput.safeParse({ name: 'A'.repeat(101), ...validReq() }).success).toBe(
        false,
      );
    });
    it('normalizes excess whitespace', () => {
      const r = addCandidateInput.parse({ name: '  Nguyễn   Văn   A  ', ...validReq() });
      expect(r.name).toBe('Nguyễn Văn A');
    });
    it('normalizes unicode hyphen', () => {
      const r = addCandidateInput.parse({ name: 'Jean‐Luc', ...validReq() });
      expect(r.name).toBe('Jean-Luc');
    });
  });

  it('validates candidate phone format in addCandidateInput and editCandidatePatch (FUT-625)', () => {
    const reqId = crypto.randomUUID();
    // Valid phone formats (including international numbers with spaces/hyphens/parentheses)
    const validPhones = [
      '0962093864',
      '+84962093864',
      '+49 123 456 789',
      '+84 900 000 222',
      '+1 (650) 555-0123',
      '0962 093864',
      '0962-093-864',
      '',
    ];
    for (const phone of validPhones) {
      expect(
        addCandidateInput.safeParse({ name: 'Valid', requisition_id: reqId, phone }).success,
      ).toBe(true);
    }

    // Invalid phone formats (non-digits, too short <7 digits, too long >15 digits)
    const invalidPhones = ['abc', '09abc', '@@@@', '12345', '1234567890123456', '+'];
    for (const phone of invalidPhones) {
      expect(
        addCandidateInput.safeParse({ name: 'Test', requisition_id: reqId, phone }).success,
      ).toBe(false);
      expect(editCandidatePatch.safeParse({ phone }).success).toBe(false);
    }
  });
});
