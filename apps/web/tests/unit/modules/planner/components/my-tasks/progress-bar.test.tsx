import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from '../../../../../../src/modules/planner/components/my-tasks/progress-bar';

describe('ProgressBar (my-tasks page-local)', () => {
  it('renders pct in the tail and as width on the fill', () => {
    render(<ProgressBar pct={60} status="In Progress" />);
    expect(screen.getByText('60%')).toBeInTheDocument();
    const fill = screen.getByTestId('progress-bar-fill');
    expect(fill.style.width).toBe('60%');
  });

  it('uses success fill when status Done or pct 100', () => {
    const { unmount } = render(<ProgressBar pct={100} status="Done" />);
    expect(screen.getByTestId('progress-bar-fill').style.background).toContain('color-success');
    unmount();
    render(<ProgressBar pct={100} status="In Progress" />);
    expect(screen.getByTestId('progress-bar-fill').style.background).toContain('color-success');
  });

  it('uses tertiary fill when status Not started or pct 0', () => {
    const { unmount } = render(<ProgressBar pct={0} status="Not started" />);
    expect(screen.getByTestId('progress-bar-fill').style.background).toContain(
      'color-ink-tertiary',
    );
    unmount();
    render(<ProgressBar pct={0} status="In Progress" />);
    expect(screen.getByTestId('progress-bar-fill').style.background).toContain(
      'color-ink-tertiary',
    );
  });

  it('uses primary fill in the in-between case', () => {
    render(<ProgressBar pct={42} status="In Progress" />);
    expect(screen.getByTestId('progress-bar-fill').style.background).toContain('color-primary');
  });
});
