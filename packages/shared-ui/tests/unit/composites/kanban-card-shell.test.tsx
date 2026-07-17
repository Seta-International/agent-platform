import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KanbanCardShell } from '../../../src/composites/kanban-card-shell';

describe('KanbanCardShell', () => {
  it('renders children inside a role=button with the given aria-label', () => {
    render(
      <KanbanCardShell ariaLabel="Candidate: Ada" draggable={{}}>
        <div>Ada</div>
      </KanbanCardShell>,
    );
    const card = screen.getByRole('button', { name: 'Candidate: Ada' });
    expect(card).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('stamps state data-attributes', () => {
    render(
      <KanbanCardShell ariaLabel="x" draggable={{ isDragging: true }} selected recentlyMoved>
        <div />
      </KanbanCardShell>,
    );
    const card = screen.getByRole('button', { name: 'x' });
    expect(card).toHaveAttribute('data-selected', 'true');
    expect(card).toHaveAttribute('data-recently-moved', 'true');
    expect(card).toHaveAttribute('data-dragging', 'true');
  });

  it('renders the saving indicator only when saving', () => {
    const { rerender } = render(
      <KanbanCardShell ariaLabel="x" draggable={{}}>
        <div />
      </KanbanCardShell>,
    );
    expect(screen.queryByTestId('saving-indicator')).toBeNull();
    rerender(
      <KanbanCardShell ariaLabel="x" draggable={{}} saving>
        <div />
      </KanbanCardShell>,
    );
    expect(screen.getByTestId('saving-indicator')).toBeInTheDocument();
  });

  it('calls onOpen on click and on Enter/Space', () => {
    const onOpen = vi.fn();
    render(
      <KanbanCardShell ariaLabel="x" draggable={{}} onOpen={onOpen}>
        <div />
      </KanbanCardShell>,
    );
    const card = screen.getByRole('button', { name: 'x' });
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('spreads pangea rootProps/handleProps and forwards ref to the root element', () => {
    const refs: Array<HTMLElement | null> = [];
    render(
      <KanbanCardShell
        ariaLabel="x"
        draggable={{
          ref: (el) => refs.push(el),
          rootProps: { 'data-rfd-draggable-id': 't1' } as React.HTMLAttributes<HTMLDivElement>,
          handleProps: {
            'data-rfd-drag-handle-draggable-id': 't1',
          } as React.HTMLAttributes<HTMLDivElement>,
          extraStyle: { transform: 'translate(1px, 2px)' },
        }}
      >
        <div />
      </KanbanCardShell>,
    );
    const card = screen.getByRole('button', { name: 'x' });
    expect(card).toHaveAttribute('data-rfd-draggable-id', 't1');
    expect(card).toHaveAttribute('data-rfd-drag-handle-draggable-id', 't1');
    expect(card.style.transform).toBe('translate(1px, 2px)');
    expect(refs).toContain(card);
  });

  it('renders header above the body and footer under a hairline, only when provided', () => {
    const { rerender } = render(
      <KanbanCardShell ariaLabel="x" draggable={{}}>
        <div>body</div>
      </KanbanCardShell>,
    );
    // No footer wrapper when footer prop is absent.
    expect(document.querySelector('[data-role="card-footer"]')).toBeNull();

    rerender(
      <KanbanCardShell
        ariaLabel="x"
        draggable={{}}
        header={<span>hdr</span>}
        footer={<span>ftr</span>}
      >
        <div>body</div>
      </KanbanCardShell>,
    );
    expect(screen.getByText('hdr')).toBeInTheDocument();
    const footer = document.querySelector('[data-role="card-footer"]');
    expect(footer).not.toBeNull();
    expect(footer).toHaveTextContent('ftr');
  });
});
