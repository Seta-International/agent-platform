import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimezonePicker } from '../../../src/components/TimezonePicker';

describe('TimezonePicker', () => {
  it('shows the current value as a token when a real IANA zone is selected', () => {
    const onChange = vi.fn();
    render(<TimezonePicker value="Europe/London" onChange={onChange} />);
    // 'Europe/London' is a real entry in Intl.supportedValuesOf('timeZone'), so
    // the picker resolves it to a current item and renders it as a token —
    // unlike 'UTC', which isn't in that list and would silently resolve to no
    // current item, leaving this half of the component unexercised.
    expect(screen.getByText('Europe/London')).toBeInTheDocument();
  });

  it('emits a new tz id on select when no value is set', async () => {
    const onChange = vi.fn();
    render(<TimezonePicker value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText(/select timezone/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'London' } });
    const option = await screen.findByText('Europe/London');
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith('Europe/London');
  });
});
