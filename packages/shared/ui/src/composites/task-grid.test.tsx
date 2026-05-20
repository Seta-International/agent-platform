import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskGrid, type TaskGridRow } from './task-grid';

const rows: TaskGridRow[] = [
  {
    id: 't1',
    title: 'A',
    status: 'in_progress',
    bucket: 'Sprint',
    priority: 'medium',
    assignees: [{ id: 'u1', name: 'Alice' }],
    due: null,
    labels: [],
  },
  {
    id: 't2',
    title: 'B',
    status: 'not_started',
    bucket: 'Sprint',
    priority: 'important',
    assignees: [],
    due: null,
    labels: [],
  },
];

describe('TaskGrid', () => {
  it('renders rows and group headers when grouped by bucket', () => {
    render(
      <TaskGrid rows={rows} groupBy="bucket" selection={new Set()} onSelectionChange={() => {}} />,
    );
    expect(screen.getByRole('row', { name: /A/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /B/i })).toBeInTheDocument();
    const groupRows = screen
      .getAllByRole('row')
      .filter((row) => row.classList.contains('task-grid__group-header'));
    expect(groupRows).toHaveLength(1);
    expect(groupRows[0]).toHaveTextContent('Sprint (2)');
  });

  it('opens an inline editor when title cell clicked', () => {
    const onCommit = vi.fn();
    render(
      <TaskGrid
        rows={rows}
        groupBy="bucket"
        selection={new Set()}
        onSelectionChange={() => {}}
        onCommitField={onCommit}
      />,
    );
    fireEvent.click(screen.getByText('A'));
    const input = screen.getByDisplayValue('A');
    fireEvent.change(input, { target: { value: 'A2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('t1', { title: 'A2' });
  });

  it('Enter commit does not fire onCommitField a second time when blur follows', () => {
    const onCommit = vi.fn();
    render(
      <TaskGrid
        rows={rows}
        groupBy="bucket"
        selection={new Set()}
        onSelectionChange={() => {}}
        onCommitField={onCommit}
      />,
    );
    fireEvent.click(screen.getByText('A'));
    const input = screen.getByDisplayValue('A');
    fireEvent.change(input, { target: { value: 'A3' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Simulate the blur that fires when the input unmounts after Enter
    fireEvent.blur(input);
    expect(onCommit.mock.calls.length).toBe(1);
  });

  it('range-selects rows on shift-click', () => {
    const onSelect = vi.fn();
    render(
      <TaskGrid rows={rows} groupBy="bucket" selection={new Set()} onSelectionChange={onSelect} />,
    );
    fireEvent.click(screen.getAllByRole('checkbox')[0]!); // select t1
    fireEvent.click(screen.getAllByRole('checkbox')[1]!, { shiftKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(new Set(['t1', 't2']));
  });
});
