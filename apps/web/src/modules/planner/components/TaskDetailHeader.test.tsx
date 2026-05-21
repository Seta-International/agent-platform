import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskDetailHeader } from './TaskDetailHeader';

const baseProps = {
  taskNumber: 42,
  title: 'Wire telemetry plumbing',
  groupName: 'Engineering',
  planName: 'Q3 Launch',
  bucketName: 'In progress',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-12T00:00:00Z',
  creatorName: 'Alice',
  onBack: vi.fn(),
  onAskCopilot: vi.fn(),
  onCopyLink: vi.fn(),
  onPrevious: vi.fn(),
  onNext: vi.fn(),
};

describe('TaskDetailHeader', () => {
  it('renders the back button, breadcrumb, T-ID badge, title, and metadata', () => {
    render(<TaskDetailHeader {...baseProps} />);
    expect(screen.getByRole('button', { name: /Back to board/i })).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Q3 Launch')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('T-42')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Wire telemetry plumbing', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Created/)).toBeInTheDocument();
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
    expect(screen.getByText(/by Alice/)).toBeInTheDocument();
  });

  it('renders the Ask copilot, Copy link, and prev/next action group', () => {
    render(<TaskDetailHeader {...baseProps} />);
    expect(screen.getByRole('button', { name: /Ask copilot/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Previous task/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next task/i })).toBeInTheDocument();
  });

  it('calls onBack when the back button is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<TaskDetailHeader {...baseProps} onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: /Back to board/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('invokes onPrevious when K is pressed and onNext when J is pressed', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    render(<TaskDetailHeader {...baseProps} onPrevious={onPrevious} onNext={onNext} />);

    await user.keyboard('k');
    expect(onPrevious).toHaveBeenCalledTimes(1);
    await user.keyboard('j');
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('does not hijack J/K while the user is typing in an input', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    render(
      <>
        <TaskDetailHeader {...baseProps} onPrevious={onPrevious} onNext={onNext} />
        <input aria-label="search" />
      </>,
    );
    const input = screen.getByLabelText('search');
    await user.click(input);
    await user.keyboard('jk');
    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });
});
