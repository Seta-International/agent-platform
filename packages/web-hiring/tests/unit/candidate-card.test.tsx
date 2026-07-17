import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateListItem } from '../../src/api/hiring-client.ts';
import { CandidateCard } from '../../src/pages/candidate-card.tsx';
import { fitScoreBadge } from '../../src/pages/candidate-utils.ts';

const base: CandidateListItem = {
  application_id: 'a1',
  candidate_id: 'c1',
  name: 'Amara Lindgren',
  seniority: 'Senior',
  source: 'LinkedIn',
  requisition_id: 'r1',
  requisition_title: 'Product Designer',
  stage: 'new',
  status: 'active',
  rating: 4,
  version: 1,
  applied_at: new Date().toISOString(),
  skills: [
    { skill_id: 's1', skill_name: 'Figma', level: null },
    { skill_id: 's2', skill_name: 'UX', level: null },
    { skill_id: 's3', skill_name: 'Proto', level: null },
    { skill_id: 's4', skill_name: 'Systems', level: null },
    { skill_id: 's5', skill_name: 'Research', level: null },
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

  it('renders a rating when set and a fallback when null', () => {
    const { rerender } = render(<CandidateCard item={base} onSelect={vi.fn()} draggable={{}} />);
    expect(screen.getByLabelText('Rating 4 of 5')).toBeInTheDocument();
    rerender(<CandidateCard item={{ ...base, rating: null }} onSelect={vi.fn()} draggable={{}} />);
    expect(screen.getByText('Not rated yet')).toBeInTheDocument();
  });

  it('shows up to four skills then an overflow count', () => {
    render(<CandidateCard item={base} onSelect={vi.fn()} draggable={{}} />);
    expect(screen.getByText('Figma')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('calls onSelect with the candidate id when the card is clicked', () => {
    const onSelect = vi.fn();
    render(<CandidateCard item={base} onSelect={onSelect} draggable={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Candidate: Amara Lindgren' }));
    expect(onSelect).toHaveBeenCalledWith(base.candidate_id);
  });

  it('renders the fit score badge text', () => {
    render(<CandidateCard item={base} onSelect={vi.fn()} draggable={{}} />);
    const { text } = fitScoreBadge(base.fit);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('shows the source and applied time in the footer', () => {
    render(<CandidateCard item={base} onSelect={vi.fn()} draggable={{}} />);
    expect(screen.getByText(/LinkedIn/)).toBeInTheDocument();
    expect(screen.getByText(/ago|just now/)).toBeInTheDocument();
  });
});
