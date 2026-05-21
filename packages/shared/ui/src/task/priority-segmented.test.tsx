import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PrioritySegmented } from './priority-segmented';

describe('PrioritySegmented', () => {
  it('renders four stops in the correct order: 1, 3, 5, 9', () => {
    render(<PrioritySegmented value={5} onChange={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('data-value'))).toEqual(['1', '3', '5', '9']);
  });
  it('marks the active stop as aria-pressed and applies the active style', () => {
    render(<PrioritySegmented value={3} onChange={() => {}} />);
    const active = screen.getByRole('button', { name: /Important/ });
    expect(active).toHaveAttribute('aria-pressed', 'true');
  });
  it('calls onChange with the numeric value on click', () => {
    const onChange = vi.fn();
    render(<PrioritySegmented value={5} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Urgent/ }));
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
