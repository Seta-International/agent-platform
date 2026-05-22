import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusPill } from './status-pill';

describe('StatusPill', () => {
  it.each([
    ['on-track', 'On track'],
    ['at-risk', 'At risk'],
    ['off-track', 'Off track'],
    ['active', 'Active'],
    ['pending', 'Pending'],
    ['blocked', 'Blocked'],
  ] as const)('renders %s as "%s"', (kind, text) => {
    render(<StatusPill kind={kind} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('uses success tokens for on-track', () => {
    const { container } = render(<StatusPill kind="on-track" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.style.background).toBe('var(--color-success-tint)');
    expect(pill.style.color).toBe('var(--color-success-ink)');
  });

  it('uses danger tokens for blocked', () => {
    const { container } = render(<StatusPill kind="blocked" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.style.background).toBe('var(--color-danger-tint)');
  });
});
