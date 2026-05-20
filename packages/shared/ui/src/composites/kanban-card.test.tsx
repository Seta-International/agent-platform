import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KanbanCard } from './kanban-card';

const task = {
  id: 't1',
  title: 'Ship M3 spec',
  priority: 'urgent' as const,
  due_label: '2d',
  label: { name: 'api', color: undefined },
  assignees: [
    { user_id: 'u1', display_name: 'Jane Doe' },
    { user_id: 'u2', display_name: 'Mark Lee' },
  ],
  recentlyMoved: false,
  saving: false,
};

describe('KanbanCard', () => {
  it('renders title, priority, due label, label chip, and first assignee initials', () => {
    render(<KanbanCard task={task} draggable={{}} />);

    expect(screen.getByText('Ship M3 spec')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Urgent priority' })).toBeInTheDocument();
    expect(screen.getByText('2d')).toBeInTheDocument();
    expect(screen.getByText('api')).toBeInTheDocument();
    expect(screen.getByTitle('Jane Doe')).toBeInTheDocument();
  });

  it('applies kanban-card--recently-moved class when recentlyMoved is true', () => {
    render(<KanbanCard task={{ ...task, recentlyMoved: true }} draggable={{}} />);

    const article = screen.getByRole('button', { name: /Ship M3 spec/ });
    expect(article.className).toContain('kanban-card--recently-moved');
  });

  it('renders saving indicator when saving is true', () => {
    render(<KanbanCard task={{ ...task, saving: true }} draggable={{}} />);

    expect(screen.getByTestId('saving-indicator')).toBeInTheDocument();
  });
});
