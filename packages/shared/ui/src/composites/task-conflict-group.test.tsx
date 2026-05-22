import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskConflictGroup } from './task-conflict-group';

const baseFields = [
  { field: 'title', local: 'Local Title', remote: 'Remote Title' },
  { field: 'due_at', local: '2024-01-01', remote: '2024-02-01' },
];

const baseProps = {
  taskId: 'task-1',
  taskTitle: 'My Task',
  taskUrl: 'https://tasks.example.com/task-1',
  fields: baseFields,
  decisions: {},
  onChoose: () => {},
};

describe('TaskConflictGroup', () => {
  it('renders the task title as a link to taskUrl with target=_blank and rel=noopener noreferrer', () => {
    render(<TaskConflictGroup {...baseProps} />);
    const link = screen.getByRole('link', { name: /My Task/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://tasks.example.com/task-1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders meta "(2 conflicts · 0/2 chosen)" with correct counts', () => {
    render(<TaskConflictGroup {...baseProps} />);
    expect(screen.getByText(/2 conflicts/)).toBeInTheDocument();
    expect(screen.getByText(/0\/2 chosen/)).toBeInTheDocument();
  });

  it('uses singular "1 conflict" for a single field', () => {
    render(
      <TaskConflictGroup {...baseProps} fields={[{ field: 'title', local: 'A', remote: 'B' }]} />,
    );
    expect(screen.getByText(/1 conflict/)).toBeInTheDocument();
    expect(screen.queryByText(/1 conflicts/)).not.toBeInTheDocument();
  });

  it('uses plural "2 conflicts" for multiple fields', () => {
    render(<TaskConflictGroup {...baseProps} />);
    expect(screen.getByText(/2 conflicts/)).toBeInTheDocument();
    expect(screen.queryByText(/2 conflict[^s]/)).not.toBeInTheDocument();
  });

  it('with defaultOpen=true, FieldConflictRow testids are visible', () => {
    render(<TaskConflictGroup {...baseProps} defaultOpen={true} />);
    expect(screen.getByTestId('conflict-row-title')).toBeInTheDocument();
    expect(screen.getByTestId('conflict-row-due_at')).toBeInTheDocument();
  });

  it('with defaultOpen=false (default), field rows are NOT in the document', () => {
    render(<TaskConflictGroup {...baseProps} />);
    expect(screen.queryByTestId('conflict-row-title')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conflict-row-due_at')).not.toBeInTheDocument();
  });

  it('clicking the header toggles field visibility open then closed', async () => {
    const user = userEvent.setup();
    render(<TaskConflictGroup {...baseProps} />);

    expect(screen.queryByTestId('conflict-row-title')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /expand/i }));
    expect(screen.getByTestId('conflict-row-title')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /collapse/i }));
    expect(screen.queryByTestId('conflict-row-title')).not.toBeInTheDocument();
  });

  it('chosen count updates when decisions prop changes', () => {
    const { rerender } = render(<TaskConflictGroup {...baseProps} decisions={{}} />);
    expect(screen.getByText(/0\/2 chosen/)).toBeInTheDocument();

    rerender(<TaskConflictGroup {...baseProps} decisions={{ title: 'local' }} />);
    expect(screen.getByText(/1\/2 chosen/)).toBeInTheDocument();
  });

  it('onChoose from a child row forwards (field, choice) correctly', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <TaskConflictGroup {...baseProps} decisions={{}} onChoose={onChoose} defaultOpen={true} />,
    );

    const [useSeta] = screen.getAllByRole('radio', { name: /Use Seta/i });
    await user.click(useSeta!);
    expect(onChoose).toHaveBeenCalledWith('title', 'local');
  });

  it('clicking the title link does NOT toggle the collapse', async () => {
    const user = userEvent.setup();
    render(<TaskConflictGroup {...baseProps} />);

    expect(screen.queryByTestId('conflict-row-title')).not.toBeInTheDocument();

    const link = screen.getByRole('link', { name: /My Task/i });
    await user.click(link);

    // Still closed — link click should not have propagated to the toggle
    expect(screen.queryByTestId('conflict-row-title')).not.toBeInTheDocument();
  });

  it('header has aria-expanded reflecting open state', async () => {
    const user = userEvent.setup();
    render(<TaskConflictGroup {...baseProps} />);

    const header = screen.getByRole('button', { name: /expand/i });
    expect(header).toHaveAttribute('aria-expanded', 'false');

    await user.click(header);
    expect(screen.getByRole('button', { name: /collapse/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
