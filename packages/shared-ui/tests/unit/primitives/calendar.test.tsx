import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Calendar } from '../../../src/primitives/calendar';

describe('Calendar (Astryx contract under happy-dom)', () => {
  it('fires onChange with a YYYY-MM-DD string when a day is clicked', () => {
    const onChange = vi.fn();
    render(<Calendar mode="single" value="2026-07-10" onChange={onChange} />);
    const day = screen.getByRole('button', { name: /15/ });
    day.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2026-07-15', expect.any(Date));
  });

  it('does not fire onChange with undefined when the selected day is clicked again', () => {
    const onChange = vi.fn();
    render(<Calendar mode="single" value="2026-07-10" onChange={onChange} />);
    screen.getByRole('button', { name: /10/ }).click();
    // Spec Decision 4: Astryx single-mode always delivers a value (rdp fired undefined).
    for (const call of onChange.mock.calls) {
      expect(call[0]).toBeTruthy();
    }
  });

  it('supports range mode with widened { start, end } strings', () => {
    render(<Calendar mode="range" value={{ start: '2026-07-06', end: '2026-07-09' }} />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(20);
  });
});
