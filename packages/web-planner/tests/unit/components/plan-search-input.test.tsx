import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanSearchInput } from '../../../src/components/plan-search-input';

// FUT-34 — Vietnamese (Telex/VNI) input was corrupted because the query was
// propagated / echoed back into the field while the IME was still composing,
// turning "điện thoại" into "đđiệênn thoaii". These tests pin the composition
// handling so the field never mutates or searches mid-composition.
describe('PlanSearchInput — IME composition (FUT-34)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const getInput = () =>
    screen.getByRole('searchbox', { name: /search tasks/i }) as HTMLInputElement;

  it('does not propagate the query while a composition is in progress', () => {
    const onChange = vi.fn();
    render(<PlanSearchInput value="" onChange={onChange} />);
    const input = getInput();

    fireEvent.compositionStart(input);
    // Telex assembles the word through intermediate change events.
    fireEvent.change(input, { target: { value: 'die' } });
    fireEvent.change(input, { target: { value: 'điện thoại' } });

    // Even past the 250ms debounce window, nothing is searched mid-composition.
    act(() => vi.advanceTimersByTime(500));
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('điện thoại');
  });

  it('propagates the finalized text exactly once after composition ends', () => {
    const onChange = vi.fn();
    render(<PlanSearchInput value="" onChange={onChange} />);
    const input = getInput();

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'điện thoại' } });
    fireEvent.compositionEnd(input);

    act(() => vi.advanceTimersByTime(250));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('điện thoại');
  });

  it('does not overwrite the field from a prop echo during composition', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PlanSearchInput value="" onChange={onChange} />);
    const input = getInput();

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'điện' } });
    // Parent re-renders with a stale/echoed value mid-composition.
    rerender(<PlanSearchInput value="die" onChange={onChange} />);

    // The composing text is preserved, not clobbered back to "die".
    expect(input.value).toBe('điện');
  });

  it('still debounces ordinary (non-IME) typing', () => {
    const onChange = vi.fn();
    render(<PlanSearchInput value="" onChange={onChange} />);
    const input = getInput();

    fireEvent.change(input, { target: { value: 'phone' } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('phone');
  });
});
