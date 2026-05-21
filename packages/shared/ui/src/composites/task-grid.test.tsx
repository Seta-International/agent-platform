import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskGrid, type TaskGridRow } from './task-grid';

const rows: TaskGridRow[] = [
  {
    id: 't1',
    title: 'A',
    status: 'in_progress',
    bucket: 'Sprint',
    bucket_id: 'b1',
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
    bucket_id: 'b1',
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

  it('commits a new status when a status option is picked', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Edit status for A/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    expect(onCommit).toHaveBeenCalledWith('t1', { status: 'completed' });
  });

  it('commits a new priority when a priority option is picked', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Edit priority for B/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Urgent' }));
    expect(onCommit).toHaveBeenCalledWith('t2', { priority: 'urgent' });
  });

  it('commits a new bucket when bucketOptions are provided', () => {
    const onCommit = vi.fn();
    render(
      <TaskGrid
        rows={rows}
        groupBy="bucket"
        selection={new Set()}
        onSelectionChange={() => {}}
        onCommitField={onCommit}
        bucketOptions={[
          { id: 'b1', name: 'Sprint' },
          { id: 'b2', name: 'Backlog' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Edit bucket for A/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Backlog' }));
    expect(onCommit).toHaveBeenCalledWith('t1', { bucket_id: 'b2', bucket: 'Backlog' });
  });

  it('opens the task sheet when assignees cell is clicked', () => {
    const onOpenTask = vi.fn();
    render(
      <TaskGrid
        rows={rows}
        groupBy="bucket"
        selection={new Set()}
        onSelectionChange={() => {}}
        onOpenTask={onOpenTask}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Edit assignees for A/i }));
    expect(onOpenTask).toHaveBeenCalledWith('t1');
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
