import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LabelChip } from './label-chip';

describe('LabelChip', () => {
  it('renders the label name', () => {
    render(<LabelChip name="Bug" />);
    expect(screen.getByText('Bug')).toBeInTheDocument();
  });

  it('honors an explicit color prop', () => {
    render(<LabelChip name="Feature" color="purple" />);
    const el = screen.getByText('Feature');
    expect(el.className).toContain('label-chip--purple');
  });

  it('assigns a deterministic color for the same name', () => {
    const { rerender } = render(<LabelChip name="Design" />);
    const firstClass = screen.getByText('Design').className;

    rerender(<LabelChip name="Design" />);
    expect(screen.getByText('Design').className).toBe(firstClass);
  });
});
