import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateListItem } from '../../src/api/hiring-client.ts';
import { CandidateCard } from '../../src/pages/candidate-card.tsx';
import { fitLabel } from '../../src/pages/candidate-utils.ts';

const base: CandidateListItem = {
  application_id: 'a1',
  candidate_id: 'c1',
  name: 'Amara Lindgren',
  seniority: 'Senior',
  source: 'LinkedIn',
  requisition_id: 'r1',
  requisition_title: 'Product Designer',
  requisition_status: 'open',
  stage: 'new',
  status: 'active',
  rating: 4,
  version: 1,
  applied_at: new Date().toISOString(),
  skills: [
    { skill_id: 's1', skill_name: 'Figma', level: null },
    { skill_id: 's2', skill_name: 'UX', level: null },
  ],
  required_skills: [
    { skill_id: 's1', skill_name: 'Figma', level: 3 },
    { skill_id: 's2', skill_name: 'UX', level: null },
  ],
  fit: { met: 1, required: 2, score: 0.5, strong: false },
};

describe('CandidateCard', () => {
  it('shows seniority when present and hides it when null', () => {
    const { rerender } = render(<CandidateCard item={base} onSelect={vi.fn()} draggable={{}} />);
    expect(screen.getByText('Senior')).toBeInTheDocument();
    rerender(
      <CandidateCard item={{ ...base, seniority: null }} onSelect={vi.fn()} draggable={{}} />,
    );
    expect(screen.queryByText('Senior')).toBeNull();
  });

  it('renders the rating as n/5 and a fallback when null', () => {
    const { rerender } = render(<CandidateCard item={base} onSelect={vi.fn()} draggable={{}} />);
    expect(screen.getByText('4/5')).toBeInTheDocument();
    rerender(<CandidateCard item={{ ...base, rating: null }} onSelect={vi.fn()} draggable={{}} />);
    expect(screen.getByText('Not rated yet')).toBeInTheDocument();
  });

  it('calls onSelect with the candidate id when the card is clicked', () => {
    const onSelect = vi.fn();
    render(<CandidateCard item={base} onSelect={onSelect} draggable={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Candidate: Amara Lindgren' }));
    expect(onSelect).toHaveBeenCalledWith(base.candidate_id);
  });

  it('renders the fit as an "n/m skills" badge (same language as the detail drawer)', () => {
    render(<CandidateCard item={base} onSelect={vi.fn()} draggable={{}} />);
    expect(screen.getByText(fitLabel(base.fit).text)).toBeInTheDocument();
  });

  it('shows the source and applied time in the footer', () => {
    render(<CandidateCard item={base} onSelect={vi.fn()} draggable={{}} />);
    expect(screen.getByText(/LinkedIn/)).toBeInTheDocument();
    expect(screen.getByText(/ago|just now/)).toBeInTheDocument();
  });

  it('checks the matched required skills in the fit hover and leaves under-levelled ones unchecked', () => {
    // Candidate has UX (met) and Figma at no level (below the required min of 3 → not met), so
    // exactly one checked row must line up with fit.met = 1. The check — not colour — is the cue,
    // so it also surfaces as a screen-reader label on precisely the matched rows.
    render(<CandidateCard item={base} onSelect={vi.fn()} draggable={{}} />);
    const matchedLabels = screen.getAllByText('(candidate has this skill)', { exact: false });
    expect(matchedLabels).toHaveLength(base.fit.met);
    const uxRow = matchedLabels[0]?.closest('span.flex');
    expect(uxRow).toHaveTextContent('UX');
    // Figma is required at level 3 but the candidate has no level → unmatched, no marker.
    const figmaRow = screen.getByText(/Figma/).closest('span.flex') as HTMLElement;
    expect(figmaRow).not.toHaveTextContent('candidate has this skill');
  });
});
