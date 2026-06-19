import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GraphNodeCard } from '../../../src/graph/graph-node-card';

describe('GraphNodeCard', () => {
  it('renders title, subtitle, and initials fallback from title', () => {
    render(<GraphNodeCard title="Vo Thi Huong" subtitle="Engagement Manager" />);
    expect(screen.getByText('Vo Thi Huong')).toBeInTheDocument();
    expect(screen.getByText('Engagement Manager')).toBeInTheDocument();
    expect(screen.getByText('VT')).toBeInTheDocument();
  });

  it('renders a count pill only when count is provided', () => {
    const { rerender } = render(<GraphNodeCard title="Delivery" />);
    expect(screen.queryByText('4')).not.toBeInTheDocument();
    rerender(<GraphNodeCard title="Delivery" count={4} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('fires onClick on click and on Enter/Space when interactive', () => {
    const onClick = vi.fn();
    render(<GraphNodeCard title="Node" onClick={onClick} />);
    const btn = screen.getByRole('button', { name: /Node/ });
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.keyDown(btn, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('is static (no button role, no handler) when interactive={false}', () => {
    const onClick = vi.fn();
    render(<GraphNodeCard title="Static" interactive={false} onClick={onClick} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Static'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders the collapse toggle only when collapsible', () => {
    const { rerender } = render(<GraphNodeCard title="Mgr" onClick={() => {}} />);
    expect(screen.queryByRole('button', { name: /toggle/i })).not.toBeInTheDocument();
    rerender(
      <GraphNodeCard title="Mgr" onClick={() => {}} collapsible onToggleCollapse={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /toggle/i })).toBeInTheDocument();
  });

  it('fires onToggleCollapse without triggering onClick (propagation stopped)', () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    render(<GraphNodeCard title="Mgr" onClick={onClick} collapsible onToggleCollapse={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /toggle/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows descendantCount in the toggle when collapsed', () => {
    render(
      <GraphNodeCard
        title="Mgr"
        collapsible
        collapsed
        descendantCount={5}
        onToggleCollapse={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /toggle/i })).toHaveTextContent('5');
  });
});
