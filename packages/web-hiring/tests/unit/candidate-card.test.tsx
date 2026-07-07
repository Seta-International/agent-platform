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
  applied_at: '2024-01-01T00:00:00.000Z',
  skills: [
    { skill_id: 's1', skill_name: 'React', level: 3 },
    { skill_id: 's2', skill_name: 'Node', level: 2 },
    { skill_id: 's3', skill_name: 'SQL', level: 2 },
    { skill_id: 's4', skill_name: 'Docker', level: 1 },
  ],
  fit: { met: 1, required: 2, score: 0.5, strong: false },
};

describe('CandidateCard', () => {
  it('renders candidate identity, fit, applied-time and skill tags, and calls onSelect on open', () => {
    const onSelect = vi.fn();
    render(<CandidateCard item={item} onSelect={onSelect} draggable={{}} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Backend Eng')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/ago$/)).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Node')).toBeInTheDocument();
    expect(screen.getByText('SQL')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Candidate: Ada Lovelace' }));
    expect(onSelect).toHaveBeenCalledWith('c1');
  });
});
