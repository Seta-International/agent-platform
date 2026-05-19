import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InboxList } from './inbox-list';

describe('InboxList', () => {
  it('renders items and fires onSelect', () => {
    const onSelect = vi.fn();
    render(
      <InboxList
        items={[
          { id: '1', title: 'A' },
          { id: '2', title: 'B' },
        ]}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText('A'));
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('marks selected item', () => {
    render(<InboxList items={[{ id: '1', title: 'A' }]} selectedId="1" onSelect={() => {}} />);
    const item = screen.getByText('A').closest('button');
    expect(item?.getAttribute('aria-current')).toBe('true');
  });
});
