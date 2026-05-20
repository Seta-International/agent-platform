import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskSheet } from './task-sheet';

const baseProps = {
  title: 'Fix login bug',
  subtitle: 'PROJ-42',
  description: <span>Describe the issue here</span>,
  properties: <span>Status: In Progress</span>,
  checklist: <span>Step 1 done</span>,
  activity: <span>Jane commented</span>,
  onClose: vi.fn(),
};

describe('TaskSheet', () => {
  it('renders all named slots', () => {
    render(<TaskSheet {...baseProps} />);

    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.getByText('PROJ-42')).toBeInTheDocument();
    expect(screen.getByText('Describe the issue here')).toBeInTheDocument();
    expect(screen.getByText('Status: In Progress')).toBeInTheDocument();
    expect(screen.getByText('Step 1 done')).toBeInTheDocument();
    expect(screen.getByText('Jane commented')).toBeInTheDocument();
  });

  it('calls onClose on close button click and on Escape keydown', () => {
    const onClose = vi.fn();
    render(<TaskSheet {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows deleted state and hides slots when deletedBy is set', () => {
    render(<TaskSheet {...baseProps} deletedBy="Jane" />);

    expect(screen.getByText(/deleted by Jane/i)).toBeInTheDocument();
    expect(screen.queryByText('Describe the issue here')).not.toBeInTheDocument();
    expect(screen.queryByText('Status: In Progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Step 1 done')).not.toBeInTheDocument();
    expect(screen.queryByText('Jane commented')).not.toBeInTheDocument();
  });
});
