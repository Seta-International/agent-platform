import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders title only', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders title + description', () => {
    render(<EmptyState title="T" description="D" />);
    expect(screen.getByText('T')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('renders an action button', () => {
    render(<EmptyState title="T" action={{ label: 'Create', onClick: () => {} }} />);
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });
});
