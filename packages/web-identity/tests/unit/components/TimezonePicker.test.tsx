import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimezonePicker } from '../../../src/components/TimezonePicker';

describe('TimezonePicker', () => {
  it('shows the current value and emits a new tz id on select', async () => {
    const onChange = vi.fn();
    render(<TimezonePicker value="UTC" onChange={onChange} />);
    const input = screen.getByPlaceholderText(/select timezone/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'London' } });
    const option = await screen.findByText('Europe/London');
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith('Europe/London');
  });
});
