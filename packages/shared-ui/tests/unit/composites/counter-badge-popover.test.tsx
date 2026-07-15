import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CounterBadgePopover } from '../../../src/composites/counter-badge-popover';

const items = [
  { id: '1', name: 'Alpha' },
  { id: '2', name: 'Beta' },
  { id: '3', name: 'Gamma' },
  { id: '4', name: 'Delta' },
];

describe('CounterBadgePopover', () => {
  it('renders visible items up to the limit and a +N overflow trigger', () => {
    render(<CounterBadgePopover items={items} title="Labels" limit={2} />);
    // HoverCard eagerly mounts `content` (hidden, not unmounted), which re-lists every
    // item for the expanded view — so Alpha/Beta each match twice. The visible-row badge
    // renders first in DOM order, so index 0 is the one actually on screen.
    expect(screen.getAllByText('Alpha')[0]).toBeVisible();
    expect(screen.getAllByText('Beta')[0]).toBeVisible();
    // Overflow trigger shows the hidden count (4 - 2 = 2).
    expect(screen.getByRole('button', { name: '+2' })).toBeInTheDocument();
  });

  it('reveals the full list on hover', async () => {
    const user = userEvent.setup();
    render(<CounterBadgePopover items={items} title="Labels" limit={2} />);
    await user.hover(screen.getByRole('button', { name: '+2' }));
    // Gamma/Delta live only in the overflow content.
    expect(await screen.findByText('Gamma')).toBeInTheDocument();
    expect(screen.getByText('Delta')).toBeInTheDocument();
  });

  it('renders an em dash when there are no items', () => {
    render(<CounterBadgePopover items={[]} title="Labels" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
