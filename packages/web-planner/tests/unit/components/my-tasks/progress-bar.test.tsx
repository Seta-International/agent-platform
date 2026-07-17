import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from '../../../../src/components/my-tasks/progress-bar';

describe('ProgressBar (my-tasks page-local)', () => {
  it('renders pct as aria-valuenow and as the visible value label', () => {
    render(<ProgressBar pct={60} status="In Progress" />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '60');
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('uses success variant when status Done or pct 100', () => {
    const { container, unmount } = render(<ProgressBar pct={100} status="Done" />);
    expect(container.firstElementChild).toHaveAttribute('data-variant', 'success');
    unmount();
    const { container: container2 } = render(<ProgressBar pct={100} status="In Progress" />);
    expect(container2.firstElementChild).toHaveAttribute('data-variant', 'success');
  });

  it('uses neutral variant when status Not started or pct 0', () => {
    const { container, unmount } = render(<ProgressBar pct={0} status="Not started" />);
    expect(container.firstElementChild).toHaveAttribute('data-variant', 'neutral');
    unmount();
    const { container: container2 } = render(<ProgressBar pct={0} status="In Progress" />);
    expect(container2.firstElementChild).toHaveAttribute('data-variant', 'neutral');
  });

  it('uses accent variant in the in-between case', () => {
    const { container } = render(<ProgressBar pct={42} status="In Progress" />);
    expect(container.firstElementChild).toHaveAttribute('data-variant', 'accent');
  });
});
