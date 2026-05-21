import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DatePill } from './date-pill';

describe('DatePill', () => {
  it('renders the kind label + formatted value', () => {
    render(<DatePill kind="Start" value="2026-08-12" onChange={() => {}} />);
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-08-12')).toBeInTheDocument();
  });
  it('renders overdue styling when overdue', () => {
    const { container } = render(
      <DatePill kind="Due" value="2024-01-01" onChange={() => {}} overdue suffix="· 2d late" />,
    );
    expect(screen.getByText(/2d late/)).toBeInTheDocument();
    expect(container.querySelector('[data-overdue="true"]')).toBeInTheDocument();
  });
  it('calls onChange with ISO string on change', () => {
    const onChange = vi.fn();
    render(<DatePill kind="Due" value="2026-08-18" onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('2026-08-18'), {
      target: { value: '2026-08-20' },
    });
    expect(onChange).toHaveBeenCalledWith('2026-08-20');
  });
  it('emits null when cleared', () => {
    const onChange = vi.fn();
    render(<DatePill kind="Due" value="2026-08-18" onChange={onChange} clearable />);
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
