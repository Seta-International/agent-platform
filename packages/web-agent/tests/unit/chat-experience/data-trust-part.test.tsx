import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DataTrustPart } from '../../../src/chat-experience/data-trust-part';

describe('DataTrustPart', () => {
  const data = {
    confidenceScore: 0.85,
    reasoningTrace: [{ step: 'rank', detail: '1 candidate', at: '2026-01-01T00:00:00Z' }],
    evidenceCitations: [{ kind: 'user', id: 'u1', label: 'Alice' }],
  };

  it('shows the citations without a confidence badge', () => {
    render(<DataTrustPart data={data} />);
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.queryByText(/confidence/i)).toBeNull();
  });

  it('expands the reasoning trace on "Why?"', async () => {
    render(<DataTrustPart data={data} />);
    expect(screen.queryByText(/1 candidate/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /why/i }));
    expect(screen.getByText(/1 candidate/)).toBeInTheDocument();
  });

  it('renders nothing when there are no citations or trace', () => {
    const { container } = render(
      <DataTrustPart data={{ confidenceScore: 0.3, reasoningTrace: [], evidenceCitations: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
