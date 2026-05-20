import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './progress-bar';

describe('ProgressBar', () => {
  it('renders 0% when total is 0', () => {
    render(<ProgressBar value={0} total={0} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toBeInTheDocument();
    const fill = bar.querySelector('.progress-bar__fill') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('renders 60% for 3 of 5', () => {
    render(<ProgressBar value={3} total={5} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.querySelector('.progress-bar__fill') as HTMLElement;
    expect(fill.style.width).toBe('60%');
  });

  it('exposes aria attributes', () => {
    render(<ProgressBar value={2} total={10} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
  });
});
