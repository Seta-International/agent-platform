import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriorityIcon } from './priority-icon';

describe('PriorityIcon', () => {
  it('renders urgent with accessible label', () => {
    render(<PriorityIcon level="urgent" />);
    expect(screen.getByRole('img', { name: 'Urgent priority' })).toBeInTheDocument();
  });

  it('renders important with accessible label', () => {
    render(<PriorityIcon level="important" />);
    expect(screen.getByRole('img', { name: 'Important priority' })).toBeInTheDocument();
  });

  it('renders medium with accessible label', () => {
    render(<PriorityIcon level="medium" />);
    expect(screen.getByRole('img', { name: 'Medium priority' })).toBeInTheDocument();
  });

  it('renders low with accessible label', () => {
    render(<PriorityIcon level="low" />);
    expect(screen.getByRole('img', { name: 'Low priority' })).toBeInTheDocument();
  });

  it('applies extra className', () => {
    render(<PriorityIcon level="urgent" className="custom" />);
    const el = screen.getByRole('img', { name: 'Urgent priority' });
    expect(el.className).toContain('custom');
    expect(el.className).toContain('priority-icon--urgent');
  });
});
