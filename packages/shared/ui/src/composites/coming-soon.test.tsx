import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComingSoon } from './coming-soon';

describe('ComingSoon', () => {
  it('renders the feature name in the message', () => {
    render(<ComingSoon feature="Activity" />);
    expect(screen.getByText('Activity is coming soon')).toBeInTheDocument();
  });

  it('renders a secondary line', () => {
    render(<ComingSoon feature="Labels" />);
    expect(screen.getByText(/working on it/i)).toBeInTheDocument();
  });

  it('passes className through to the wrapper', () => {
    const { container } = render(<ComingSoon feature="X" className="custom-class" />);
    expect((container.firstChild as HTMLElement).className).toContain('custom-class');
  });
});
