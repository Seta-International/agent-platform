import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateListItem } from '../../src/api/hiring-client.ts';
import { CandidateCard } from '../../src/pages/candidate-card.tsx';

const item: CandidateListItem = {
  application_id: 'a1',
  candidate_id: 'c1',
  name: 'Ada Lovelace',
  seniority: 'Senior',
  source: 'Referral',
  requisition_id: 'r1',
  requisition_title: 'Backend Eng',
  stage: 'new',
  status: 'active',
  rating: 0,
  version: 1,
  fit: { met: 1, required: 2, score: 0.5, strong: false },
};

describe('CandidateCard', () => {
  it('renders candidate identity and fit, and calls onSelect on open', () => {
    const onSelect = vi.fn();
    render(<CandidateCard item={item} onSelect={onSelect} draggable={{}} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Backend Eng')).toBeInTheDocument();
    expect(screen.getByText('1/2 skills')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Candidate: Ada Lovelace' }));
    expect(onSelect).toHaveBeenCalledWith('c1');
  });
});
