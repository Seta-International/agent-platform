import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlanSearchInput } from '../../../src/components/plan-search-input';

describe('PlanSearchInput', () => {
  it('does not propagate intermediate IME composition events to onChange (FUT-34)', () => {
    // A Vietnamese Telex composition session for "điện" fires compositionstart,
    // several input events while composing, then compositionend with the final text.
    // Propagating each intermediate input event round-trips through the controlled
    // `value`, clobbering the IME buffer and producing corruption like "đđiệênn".
    const onChange = vi.fn();
    render(<PlanSearchInput value="" onChange={onChange} />);
    const input = screen.getByRole('searchbox');

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'd' } });
    fireEvent.change(input, { target: { value: 'di' } });
    fireEvent.change(input, { target: { value: 'điện' } });

    expect(onChange).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input, { target: { value: 'điện' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('điện');
  });

  it('propagates plain (non-IME) typing on each change', () => {
    const onChange = vi.fn();
    render(<PlanSearchInput value="" onChange={onChange} />);
    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'phone' } });

    expect(onChange).toHaveBeenCalledWith('phone');
  });

  it('keeps in-progress typing when a stale async value arrives (FUT-34)', () => {
    // The value is sourced from the URL via async router navigation, so while
    // typing fast the parent re-renders with a lagging, older value. A naive
    // controlled input snaps back to that stale value and drops characters
    // (typing "hello" yields "o"). The input must keep the local draft.
    function Harness({ external }: { external: string }) {
      return <PlanSearchInput value={external} onChange={() => {}} />;
    }
    const { rerender } = render(<Harness external="" />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;

    input.focus();
    fireEvent.change(input, { target: { value: 'he' } });
    expect(input).toHaveValue('he');

    // Stale echo from the lagging URL round-trip — must NOT clobber the draft.
    rerender(<Harness external="h" />);
    expect(input).toHaveValue('he');
  });
});
