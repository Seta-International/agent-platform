import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MyTasksToolbar,
  type MyTasksToolbarValue,
} from '../../../../../../src/modules/planner/components/my-tasks/my-tasks-toolbar';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(over: Partial<MyTasksToolbarValue> = {}) {
  const value: MyTasksToolbarValue = { view: 'list', ...over };
  const onChange = vi.fn();
  const onSearchChange = vi.fn();
  render(
    <MyTasksToolbar
      value={value}
      planOptions={[
        { id: 'p1', name: 'Q3 Launch' },
        { id: 'p2', name: 'Roadmap' },
      ]}
      groupOptions={[{ id: 'g1', name: 'Engineering' }]}
      onChange={onChange}
      onSearchChange={onSearchChange}
    />,
  );
  return { onChange, onSearchChange };
}

describe('MyTasksToolbar', () => {
  it('renders Plan, Group, Priority, Due filter triggers + view segmented control + search', () => {
    setup();
    expect(screen.getByRole('button', { name: /Plan/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Group/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Priority/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Due/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /list view/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /grid view/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search my tasks/i)).toBeInTheDocument();
  });

  it('clicking the Grid tab calls onChange with { view: "grid" }', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole('tab', { name: /grid view/i }));
    expect(onChange).toHaveBeenCalledWith({ view: 'grid' });
  });

  it('selecting a Plan option calls onChange with { planId }', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole('button', { name: /Plan/i }));
    await user.click(await screen.findByText('Q3 Launch'));
    expect(onChange).toHaveBeenCalledWith({ planId: 'p1' });
  });

  it('selecting a Priority option maps the string to the numeric union', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole('button', { name: /Priority/i }));
    await user.click(await screen.findByText('Urgent'));
    expect(onChange).toHaveBeenCalledWith({ priority: 1 });
  });

  it('selecting a Due option calls onChange with the canonical value', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole('button', { name: /Due/i }));
    await user.click(await screen.findByText('This week'));
    expect(onChange).toHaveBeenCalledWith({ due: 'this_week' });
  });

  it('debounces search 250ms before firing onSearchChange', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onSearchChange } = setup();
    await user.type(screen.getByPlaceholderText(/search my tasks/i), 'cache');
    expect(onSearchChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(onSearchChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSearchChange).toHaveBeenCalledWith('cache');
  });

  it('search does NOT fire onSearchChange on initial mount when value.search is empty', () => {
    vi.useFakeTimers();
    const { onSearchChange } = setup({ search: '' });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it('clears Plan filter via the popover Any option', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ planId: 'p1' });
    await user.click(screen.getByRole('button', { name: /Plan/i }));
    await user.click(await screen.findByText('Any'));
    expect(onChange).toHaveBeenCalledWith({ planId: undefined });
  });
});
