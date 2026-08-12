import { describe, expect, it, vi } from 'vitest';
import type { CandidateListItem } from '../../src/api/hiring-client.ts';
import { buildCandidatesCsv, exportCandidatesCsv } from '../../src/pages/export-candidate-csv.ts';

function makeCandidate(overrides: Partial<CandidateListItem> = {}): CandidateListItem {
  return {
    application_id: 'app-1',
    candidate_id: 'cand-1',
    name: 'Nguyễn Văn A',
    seniority: 'senior',
    source: 'referral',
    requisition_id: 'req-1',
    requisition_title: 'Senior Developer',
    requisition_status: 'open',
    stage: 'screening',
    status: 'active',
    rating: 4,
    version: 1,
    applied_at: '2026-08-10T10:00:00.000Z',
    skills: [
      { skill_id: 's1', skill_name: 'TypeScript', level: 4 },
      { skill_id: 's2', skill_name: 'React', level: 3 },
    ],
    required_skills: [],
    fit: { score: 0.85, required: 2, met: 2, strong: true },
    ...overrides,
  };
}

function parseCsv(csv: string): string[][] {
  const raw = csv.startsWith('\uFEFF') ? csv.slice(1) : csv;
  return raw.split('\n').map((line) => line.split(','));
}

describe('buildCandidatesCsv', () => {
  it('starts with UTF-8 BOM (\\uFEFF) for Excel compatibility with Vietnamese characters', () => {
    const csv = buildCandidatesCsv([makeCandidate()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('correctly produces header and candidate data row with Vietnamese characters intact', () => {
    const candidate = makeCandidate({
      name: 'Trần Thị Bích Ngọc',
      requisition_title: 'Kỹ sư phần mềm',
    });
    const csv = buildCandidatesCsv([candidate]);
    expect(csv).toContain('Trần Thị Bích Ngọc');
    expect(csv).toContain('Kỹ sư phần mềm');

    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([
      'Name',
      'Position',
      'Seniority',
      'Source',
      'Stage',
      'Rating',
      'Fit',
      'Skills',
      'Applied at',
    ]);
    expect(rows[1]).toEqual([
      'Trần Thị Bích Ngọc',
      'Kỹ sư phần mềm',
      'senior',
      'referral',
      'screening',
      '4',
      '85%',
      'TypeScript; React',
      '2026-08-10',
    ]);
  });

  it('escapes cell values containing commas, quotes, and newlines per RFC 4180', () => {
    const candidate = makeCandidate({
      name: 'Đỗ, "Văn" C',
      requisition_title: 'Lead\nEngineer',
    });
    const csv = buildCandidatesCsv([candidate]);
    expect(csv).toContain('"Đỗ, ""Văn"" C"');
    expect(csv).toContain('"Lead\nEngineer"');
  });

  it('handles empty rows, null ratings, and zero required fit skills correctly', () => {
    const emptyCsv = buildCandidatesCsv([]);
    expect(emptyCsv.startsWith('\uFEFF')).toBe(true);
    expect(parseCsv(emptyCsv)).toHaveLength(1);

    const candidate = makeCandidate({
      seniority: null,
      source: null,
      rating: null,
      skills: [],
      fit: { score: 0, required: 0, met: 0, strong: false },
    });
    const rows = parseCsv(buildCandidatesCsv([candidate]));
    const dataRow = rows[1]!;
    expect(dataRow[2]).toBe(''); // Seniority
    expect(dataRow[3]).toBe(''); // Source
    expect(dataRow[5]).toBe(''); // Rating
    expect(dataRow[6]).toBe(''); // Fit
    expect(dataRow[7]).toBe(''); // Skills
  });
});

describe('exportCandidatesCsv', () => {
  it('triggers a DOM download with candidates.csv and text/csv;charset=utf-8', () => {
    const mockClick = vi.fn();
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test');
    const mockRevokeObjectURL = vi.fn();

    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      click: mockClick,
      href: '',
      download: '',
    } as unknown as HTMLAnchorElement);

    exportCandidatesCsv([makeCandidate()]);

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(mockClick).toHaveBeenCalled();
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/test');

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
