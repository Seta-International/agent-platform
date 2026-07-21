import { describe, expect, it, vi } from 'vitest';
import type { WorkerCvDraft } from '../../src/api/people-client.ts';
import {
  applyDraftToForm,
  EMPTY_WORKER_FORM,
  formToCreateInput,
  saveWorkerWithCv,
  validateWorkerForm,
} from '../../src/lib/cv-intake.ts';

const DRAFT: WorkerCvDraft = {
  full_name: 'Nguyen Van E',
  personal_email: 'e@gmail.com',
  phone: '+84 911 222 333',
  dob: '1995-05-05',
  gender: 'female',
  job_title: 'Data Engineer',
  skills: [{ skill_id: 's1', skill_name: 'Python' }],
  skill_suggestions: ['Airflow'],
  summary: 'Data engineer.',
};

describe('applyDraftToForm', () => {
  it('fills empty fields from the draft', () => {
    const next = applyDraftToForm(DRAFT, EMPTY_WORKER_FORM);
    expect(next.full_name).toBe('Nguyen Van E');
    expect(next.personal_email).toBe('e@gmail.com');
    expect(next.job_title).toBe('Data Engineer');
    expect(next.work_email).toBe(''); // never parsed — company-assigned
  });

  it('never overwrites values the user already typed', () => {
    const next = applyDraftToForm(DRAFT, {
      ...EMPTY_WORKER_FORM,
      full_name: 'Manual Name',
      phone: '000',
    });
    expect(next.full_name).toBe('Manual Name');
    expect(next.phone).toBe('000');
    expect(next.dob).toBe('1995-05-05');
  });
});

describe('formToCreateInput', () => {
  it('drops empty strings and trims values', () => {
    const input = formToCreateInput({
      ...EMPTY_WORKER_FORM,
      full_name: '  Jane  ',
      personal_email: 'j@x.y',
    });
    expect(input).toEqual({ full_name: 'Jane', personal_email: 'j@x.y' });
  });
});

describe('validateWorkerForm', () => {
  it('passes a form with only a full name', () => {
    expect(validateWorkerForm({ ...EMPTY_WORKER_FORM, full_name: 'Jane' })).toEqual({});
  });

  it('requires full name, ignoring whitespace', () => {
    expect(validateWorkerForm(EMPTY_WORKER_FORM)).toEqual({
      full_name: 'Full name is required.',
    });
    expect(validateWorkerForm({ ...EMPTY_WORKER_FORM, full_name: '   ' })).toEqual({
      full_name: 'Full name is required.',
    });
  });

  it('rejects malformed emails but accepts empty ones (mirrors the createWorker contract)', () => {
    expect(
      validateWorkerForm({
        ...EMPTY_WORKER_FORM,
        full_name: 'Jane',
        personal_email: 'not-an-email',
        work_email: 'jane@company',
      }),
    ).toEqual({
      personal_email: 'Enter a valid email address.',
      work_email: 'Enter a valid email address.',
    });
    expect(
      validateWorkerForm({
        ...EMPTY_WORKER_FORM,
        full_name: 'Jane',
        personal_email: 'jane@gmail.com',
        work_email: 'jane@company.io',
      }),
    ).toEqual({});
  });

  it('reports every failing field at once', () => {
    const errors = validateWorkerForm({ ...EMPTY_WORKER_FORM, personal_email: 'nope' });
    expect(Object.keys(errors).sort()).toEqual(['full_name', 'personal_email']);
  });
});

describe('saveWorkerWithCv', () => {
  const file = { name: 'cv.pdf', type: 'application/pdf' } as File;

  function deps() {
    return {
      createWorker: vi.fn().mockResolvedValue({ worker_id: 'w1' }),
      addWorkerSkill: vi.fn().mockResolvedValue(undefined),
      requestCvUpload: vi
        .fn()
        .mockResolvedValue({ upload_url: 'https://put', s3_key: 'tenants/t/people-cv/w1/cv.pdf' }),
      putToS3: vi.fn().mockResolvedValue(undefined),
      patchWorker: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('creates worker, adds skills, uploads CV, then patches the key — in order', async () => {
    const d = deps();
    const res = await saveWorkerWithCv(d, {
      form: { ...EMPTY_WORKER_FORM, full_name: 'X' },
      skillIds: ['s1', 's2'],
      cvFile: file,
    });
    expect(res).toEqual({ worker_id: 'w1', warnings: [] });
    expect(d.addWorkerSkill).toHaveBeenCalledTimes(2);
    expect(d.requestCvUpload).toHaveBeenCalledWith('w1', 'cv.pdf', 'application/pdf');
    expect(d.putToS3).toHaveBeenCalledWith('https://put', file);
    expect(d.patchWorker).toHaveBeenCalledWith('w1', {
      cv_storage_key: 'tenants/t/people-cv/w1/cv.pdf',
    });
  });

  it('keeps the created worker and reports warnings when skills or CV fail', async () => {
    const d = deps();
    d.addWorkerSkill.mockRejectedValueOnce(new Error('boom'));
    d.putToS3.mockRejectedValue(new Error('network'));
    const res = await saveWorkerWithCv(d, {
      form: { ...EMPTY_WORKER_FORM, full_name: 'X' },
      skillIds: ['s1', 's2'],
      cvFile: file,
    });
    expect(res.worker_id).toBe('w1');
    expect(res.warnings).toHaveLength(2);
    expect(d.patchWorker).not.toHaveBeenCalled();
  });

  it('skips skills and CV steps entirely when not provided', async () => {
    const d = deps();
    const res = await saveWorkerWithCv(d, {
      form: { ...EMPTY_WORKER_FORM, full_name: 'X' },
      skillIds: [],
      cvFile: null,
    });
    expect(res.warnings).toEqual([]);
    expect(d.addWorkerSkill).not.toHaveBeenCalled();
    expect(d.requestCvUpload).not.toHaveBeenCalled();
  });
});
