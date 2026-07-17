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
    const { unmount } = render(<ProgressBar pct={100} status="Done" />);
    expect(screen.getByRole('progressbar').closest('[data-variant]')).toHaveAttribute(
      'data-variant',
      'success',
    );
    unmount();
    render(<ProgressBar pct={100} status="In Progress" />);
    expect(screen.getByRole('progressbar').closest('[data-variant]')).toHaveAttribute(
      'data-variant',
      'success',
    );
  });

  it('uses neutral variant when status Not started or pct 0', () => {
    const { unmount } = render(<ProgressBar pct={0} status="Not started" />);
    expect(screen.getByRole('progressbar').closest('[data-variant]')).toHaveAttribute(
      'data-variant',
      'neutral',
    );
    unmount();
    render(<ProgressBar pct={0} status="In Progress" />);
    expect(screen.getByRole('progressbar').closest('[data-variant]')).toHaveAttribute(
      'data-variant',
      'neutral',
    );
  });

  it('uses accent variant in the in-between case', () => {
    render(<ProgressBar pct={42} status="In Progress" />);
    expect(screen.getByRole('progressbar').closest('[data-variant]')).toHaveAttribute(
      'data-variant',
      'accent',
    );
  });

  it('resolves isDone/isNot precedence exactly: pct wins over status', () => {
    // pct===100 must win over status==='Not started'.
    render(<ProgressBar pct={100} status="Not started" />);
    expect(screen.getByRole('progressbar').closest('[data-variant]')).toHaveAttribute(
      'data-variant',
      'success',
    );
  });

  it('resolves isDone/isNot precedence exactly: status Done wins over pct 0', () => {
    // pct===0 with status==='Done' must resolve to success (isDone checked before isNot).
    render(<ProgressBar pct={0} status="Done" />);
    expect(screen.getByRole('progressbar').closest('[data-variant]')).toHaveAttribute(
      'data-variant',
      'success',
    );
  });

  it('renders no header/label row above the track — just the compact inline bar', () => {
    render(<ProgressBar pct={60} status="In Progress" />);
    // Astryx's own value-label row (rendered when hasValueLabel is set) must be off;
    // the "60%" text comes solely from this component's own span, not Astryx's header.
    const valueLabelSpans = screen.getAllByText('60%');
    expect(valueLabelSpans).toHaveLength(1);
  });
});
