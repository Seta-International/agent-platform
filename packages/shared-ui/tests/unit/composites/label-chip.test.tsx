import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LabelChip } from '../../../src/composites/label-chip';

describe('LabelChip', () => {
  it('renders the label name', () => {
    render(<LabelChip name="Bug" />);
    expect(screen.getByText('Bug')).toBeInTheDocument();
  });

  it('honors an explicit color prop', () => {
    render(<LabelChip name="Feature" color="purple" />);
    const el = screen.getByText('Feature');
    expect(el.getAttribute('data-variant')).toBe('purple');
  });

  it('assigns a deterministic color for the same name', () => {
    const { rerender } = render(<LabelChip name="Design" />);
    const firstVariant = screen.getByText('Design').getAttribute('data-variant');

    rerender(<LabelChip name="Design" />);
    expect(screen.getByText('Design').getAttribute('data-variant')).toBe(firstVariant);
  });

  it('exposes data-label-color matching an explicit color prop', () => {
    render(<LabelChip name="Feature" color="purple" />);
    expect(screen.getByText('Feature').getAttribute('data-label-color')).toBe('purple');
  });

  it('exposes a stable data-label-color for the hashed path (no color prop)', () => {
    const { rerender } = render(<LabelChip name="Design" />);
    const firstColor = screen.getByText('Design').getAttribute('data-label-color');
    expect(firstColor).not.toBeNull();

    rerender(<LabelChip name="Design" />);
    expect(screen.getByText('Design').getAttribute('data-label-color')).toBe(firstColor);
  });
});
