import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl, SegmentedControlItem } from '../../../src/primitives/segmented-control';

describe('SegmentedControl (Astryx contract under happy-dom)', () => {
  it('selects a segment and fires onChange with the value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl label="View" value="board" onChange={onChange}>
        <SegmentedControlItem value="board" label="Board" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>,
    );
    // PINNED: Astryx renders a radiogroup/radio pair (APG radio-group semantics),
    // not the old tablist/tab markup. The group carries the accessible name via
    // aria-label; items are role="radio" with their visible text as the name.
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'List' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('does not fire onChange for a disabled item', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl label="View" value="board" onChange={onChange}>
        <SegmentedControlItem value="board" label="Board" />
        <SegmentedControlItem value="list" label="List" isDisabled />
      </SegmentedControl>,
    );
    await user.click(screen.getByRole('radio', { name: 'List' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
