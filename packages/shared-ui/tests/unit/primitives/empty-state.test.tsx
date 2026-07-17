import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../../../src/primitives/button';
import { EmptyState } from '../../../src/primitives/empty-state';

describe('EmptyState (Astryx contract under happy-dom)', () => {
  it('renders title, description, icon and fires the action', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No projects yet"
        description="Create your first project."
        icon={<span data-testid="ic" />}
        actions={<Button label="New project" onClick={onClick} />}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No projects yet' })).toBeInTheDocument();
    expect(screen.getByText('Create your first project.')).toBeInTheDocument();
    expect(screen.getByTestId('ic')).toBeInTheDocument();
    screen.getByRole('button', { name: 'New project' }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  // Parity pin: the old hand-rolled composite rendered its title as <h3>, and
  // Astryx defaults headingLevel to 3 — so no consumer needs headingLevel.
  it('defaults the title to an h3, matching the composite it replaces', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.getByRole('heading', { name: 'Empty', level: 3 })).toBeInTheDocument();
  });

  // Pins the layout fact the plan got wrong: the root is ALWAYS a centered
  // column, so the default already reproduces the old stacked look. isCompact
  // only reduces spacing — it is NOT what makes the layout stacked.
  it('is stacked by default and marks compact only as a density variant', () => {
    const { container, rerender } = render(<EmptyState title="Empty" />);
    const root = container.querySelector('.astryx-empty-state');
    expect(root).not.toBeNull();
    expect(root).not.toHaveAttribute('data-variant', 'compact');

    rerender(<EmptyState title="Empty" isCompact />);
    expect(container.querySelector('.astryx-empty-state')).toHaveAttribute(
      'data-variant',
      'compact',
    );
  });
});
