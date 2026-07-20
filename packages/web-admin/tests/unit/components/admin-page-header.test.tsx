import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminPageHeader } from '../../../src/components/AdminPageHeader';

describe('AdminPageHeader', () => {
  it('renders the crumb, level-1 title, and actions', () => {
    render(
      <AdminPageHeader
        crumb="Groups"
        title="Groups"
        subtitle="3 groups"
        actions={<button type="button">Create group</button>}
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    // The terminal crumb reflects the page but is not itself a link.
    expect(within(nav).getByText('Groups').closest('a')).toBeNull();

    expect(screen.getByRole('heading', { level: 1, name: 'Groups' })).toBeInTheDocument();
    expect(screen.getByText('3 groups')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create group' })).toBeInTheDocument();
  });
});
