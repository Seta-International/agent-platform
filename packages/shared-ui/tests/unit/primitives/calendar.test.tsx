import { render, screen } from '@testing-library/react';
import { act, createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Calendar, type CalendarHandle } from '../../../src/primitives/calendar';

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
    // Spec Decision 4: Astryx single-mode re-fires with the same value rather than
    // deselecting (rdp fired undefined), so the consumer needs no `if (!date) return`
    // guard and its popover still closes on re-click. Assert the call positively — a
    // loop over `mock.calls` would pass vacuously if a future bump stopped firing at all.
    expect(onChange).toHaveBeenCalledWith('2026-07-10', expect.any(Date));
  });

  it('navigates via the handle using a plain, non-literal string', () => {
    const handleRef = createRef<CalendarHandle>();
    // `month` is typed `string`, not a literal — the widened CalendarHandle is what lets
    // this compile without a cast at the call site.
    const month: string = '2027-03-01';
    render(<Calendar mode="single" value="2026-07-10" handleRef={handleRef} />);
    act(() => handleRef.current?.navigateTo(month));
    expect(screen.getByText('March 2027')).toBeTruthy();
  });

  it('supports range mode with widened { start, end } strings', () => {
    render(<Calendar mode="range" value={{ start: '2026-07-06', end: '2026-07-09' }} />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(20);
  });
});
