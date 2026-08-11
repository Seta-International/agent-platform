import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import {
  CvParseError,
  type CvProfileDraft,
  cvProfileDraft,
  parseCvProfile,
} from '../../src/backend/parse/cv-profile.ts';

const CV_TEXT = [
  'Nguyen Van A',
  'Senior Backend Engineer',
  'Email: nguyenvana@gmail.com · Phone: +84 912 000 111 · DOB: 12/03/1994',
  'Skills: TypeScript, PostgreSQL, Docker',
].join('\n');

const DRAFT: CvProfileDraft = {
  full_name: 'Nguyen Van A',
  personal_email: 'nguyenvana@gmail.com',
  phone: '+84 912 000 111',
  dob: '1994-03-12',
  gender: null,
  current_title: 'Senior Backend Engineer',
  seniority_hint: 'senior',
  skills: ['TypeScript', 'PostgreSQL', 'Docker'],
  summary: 'Senior backend engineer experienced with TypeScript and PostgreSQL.',
};

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

function modelReturning(text: string) {
  return new MockLanguageModelV3({
    doGenerate: async () =>
      ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: 'stop',
        usage,
        content: [{ type: 'text', text }],
        warnings: [],
      }) as never,
  });
}

describe('cvProfileDraft', () => {
  it('dob regex avoids \\d so local llama.cpp can compile the grammar', () => {
    const dob = cvProfileDraft.shape.dob;
    // Zod stores the regex on the inner string check; walk to the pattern source.
    const source = JSON.stringify(dob);
    expect(source).not.toMatch(/\\d/);
    expect(cvProfileDraft.safeParse({ ...DRAFT, dob: '1994-03-12' }).success).toBe(true);
    expect(cvProfileDraft.safeParse({ ...DRAFT, dob: '94-03-12' }).success).toBe(false);
  });
});

describe('parseCvProfile', () => {
  it('extracts a zod-valid draft from a text CV', async () => {
    const draft = await parseCvProfile(Buffer.from(CV_TEXT, 'utf-8'), 'cv.txt', {
      model: modelReturning(JSON.stringify(DRAFT)),
    });
    expect(draft).toEqual(DRAFT);
  });

  it('throws EMPTY_TEXT for a document with no extractable text', async () => {
    await expect(
      parseCvProfile(Buffer.from('   \n  ', 'utf-8'), 'cv.txt', {
        model: modelReturning(JSON.stringify(DRAFT)),
      }),
    ).rejects.toMatchObject({ name: 'CvParseError', code: 'EMPTY_TEXT' });
  });

  it('throws UNSUPPORTED_TYPE for an extension without a parser', async () => {
    await expect(
      parseCvProfile(Buffer.from('x'), 'cv.exe', {
        model: modelReturning(JSON.stringify(DRAFT)),
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
  });

  it('throws LLM_FAILED when the model returns unparseable output', async () => {
    const err = await parseCvProfile(Buffer.from(CV_TEXT, 'utf-8'), 'cv.txt', {
      model: modelReturning('not json at all'),
    }).catch((e) => e as CvParseError);
    expect(err).toBeInstanceOf(CvParseError);
    expect((err as CvParseError).code).toBe('LLM_FAILED');
  });
});
