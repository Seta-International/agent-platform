import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { confidenceTier, DataTrustPart } from '@/modules/agent/chat-experience/data-trust-part';

describe('confidenceTier', () => {
  it('maps scores to categorical tiers', () => {
    expect(confidenceTier(0.85)).toBe('High');
    expect(confidenceTier(0.5)).toBe('Medium');
    expect(confidenceTier(0.2)).toBe('Uncertain');
  });
});

describe('DataTrustPart', () => {
  const data = {
    confidenceScore: 0.85,
    reasoningTrace: [{ step: 'rank', detail: '1 candidate', at: '2026-01-01T00:00:00Z' }],
    evidenceCitations: [{ kind: 'user', id: 'u1', label: 'Alice' }],
  };

  it('shows the categorical confidence and citation count', () => {
    render(<DataTrustPart data={data} />);
    expect(screen.getByText(/High/)).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  it('expands the reasoning trace on "Why?"', async () => {
    render(<DataTrustPart data={data} />);
    expect(screen.queryByText(/1 candidate/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /why/i }));
    expect(screen.getByText(/1 candidate/)).toBeInTheDocument();
  });
});
