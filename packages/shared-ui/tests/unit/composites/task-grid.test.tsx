import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskGrid, type TaskGridRow } from '../../../src/composites/task-grid';

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
  it('renders rows and a group header when grouped by bucket', () => {
    render(
      <TaskGrid rows={rows} groupBy="bucket" selection={new Set()} onSelectionChange={() => {}} />,
    );
    expect(screen.getByRole('row', { name: /A/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /B/i })).toBeInTheDocument();
    // "Sprint" now appears in the group header AND in each row's bucket pill.
    expect(screen.getAllByText('Sprint').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('opens the task when title is clicked (modal/detail intent)', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Open A' }));
    expect(onOpenTask).toHaveBeenCalledWith('t1');
  });

  it('opens an inline editor when the rename pencil is clicked', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Rename A' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Rename A' }));
    const input = screen.getByDisplayValue('A');
    fireEvent.change(input, { target: { value: 'A3' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onCommit.mock.calls.length).toBe(1);
  });

  it('commits a new status when a status option is picked', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskGrid
        rows={rows}
        groupBy="bucket"
        selection={new Set()}
        onSelectionChange={() => {}}
        onCommitField={onCommit}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit status for A' }));
    await user.click(await screen.findByRole('menuitem', { name: /Completed/ }));
    expect(onCommit).toHaveBeenCalledWith('t1', { status: 'completed' });
  });

  it('commits a new priority when a priority option is picked', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskGrid
        rows={rows}
        groupBy="bucket"
        selection={new Set()}
        onSelectionChange={() => {}}
        onCommitField={onCommit}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit priority for B' }));
    await user.click(await screen.findByRole('menuitem', { name: /Urgent/ }));
    expect(onCommit).toHaveBeenCalledWith('t2', { priority: 'urgent' });
  });

  it('commits a new bucket when bucketOptions are provided', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
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
    await user.click(screen.getByRole('button', { name: 'Edit bucket for A' }));
    await user.click(await screen.findByRole('menuitem', { name: /Backlog/ }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Edit assignees for A' }));
    expect(onOpenTask).toHaveBeenCalledWith('t1');
  });

  it('renders a mini SyncBadge in the title cell when external_source is m365', () => {
    const m365Rows: TaskGridRow[] = [
      {
        ...rows[0]!,
        external_source: 'm365',
        sync_status: 'pulling',
        external_synced_at: null,
      },
      { ...rows[1]! },
    ];
    render(
      <TaskGrid
        rows={m365Rows}
        groupBy="bucket"
        selection={new Set()}
        onSelectionChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Sync pulling')).toBeInTheDocument();
    expect(screen.queryAllByLabelText(/^Sync /).length).toBe(1);
  });

  it('does not render a SyncBadge for native rows', () => {
    render(
      <TaskGrid rows={rows} groupBy="bucket" selection={new Set()} onSelectionChange={() => {}} />,
    );
    expect(screen.queryByLabelText(/^Sync /)).toBeNull();
  });

  it('range-selects rows on shift-click', () => {
    const onSelect = vi.fn();
    render(
      <TaskGrid rows={rows} groupBy="bucket" selection={new Set()} onSelectionChange={onSelect} />,
    );
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    fireEvent.click(screen.getAllByRole('checkbox')[1]!, { shiftKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(new Set(['t1', 't2']));
  });
});
