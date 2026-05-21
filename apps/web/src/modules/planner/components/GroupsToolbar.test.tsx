import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupsToolbar } from './GroupsToolbar';

const baseProps = {
  view: 'list' as const,
  onViewChange: vi.fn(),
  searchQuery: '',
  onSearchChange: vi.fn(),
  visibility: null,
  onVisibilityChange: vi.fn(),
  source: null,
  onSourceChange: vi.fn(),
  owner: null,
  onOwnerChange: vi.fn(),
  ownerOptions: [
    { value: 'u1', label: 'Jane Doe' },
    { value: 'u2', label: 'Mark Lee' },
  ],
};

describe('GroupsToolbar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders Visibility, Owner, and View controls', () => {
    render(<GroupsToolbar {...baseProps} />);
    expect(screen.getByRole('button', { name: /Visibility/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Owner/i })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: /View/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search groups/i)).toBeInTheDocument();
  });

  it('does NOT render the Source filter by default (PR2 native-only)', () => {
    render(<GroupsToolbar {...baseProps} />);
    expect(screen.queryByRole('button', { name: /Source/i })).not.toBeInTheDocument();
  });

  it('renders the Source filter when showSourceFilter=true', () => {
    render(<GroupsToolbar {...baseProps} showSourceFilter />);
    expect(screen.getByRole('button', { name: /Source/i })).toBeInTheDocument();
  });

  it('debounces search input by 250ms before calling onSearchChange', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSearchChange = vi.fn();
    render(<GroupsToolbar {...baseProps} onSearchChange={onSearchChange} />);
    await user.type(screen.getByPlaceholderText(/Search groups/i), 'eng');
    expect(onSearchChange).not.toHaveBeenCalled(); // not yet
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onSearchChange).toHaveBeenCalledWith('eng');
  });

  it('clicking Grid in segmented control calls onViewChange("grid")', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onViewChange = vi.fn();
    render(<GroupsToolbar {...baseProps} onViewChange={onViewChange} />);
    await user.click(screen.getByRole('tab', { name: /Grid/i }));
    expect(onViewChange).toHaveBeenCalledWith('grid');
  });

  it('syncs local search state when parent searchQuery changes externally', () => {
    const { rerender } = render(<GroupsToolbar {...baseProps} searchQuery="" />);
    const input = screen.getByPlaceholderText(/Search groups/i) as HTMLInputElement;
    expect(input.value).toBe('');
    rerender(<GroupsToolbar {...baseProps} searchQuery="reset" />);
    expect(input.value).toBe('reset');
  });
});
