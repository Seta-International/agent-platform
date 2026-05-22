import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageChrome, PageChromeToolbar } from './page-chrome';

describe('PageChrome', () => {
  it('renders title only', () => {
    render(<PageChrome title="Users" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
  });

  it('renders breadcrumb segments', () => {
    render(<PageChrome breadcrumb={['Admin', 'Identity']} title="Users" />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByText('Admin')).toBeInTheDocument();
    expect(within(nav).getByText('Identity')).toBeInTheDocument();
  });

  it('omits breadcrumb when empty', () => {
    render(<PageChrome breadcrumb={[]} title="Users" />);
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
  });

  it('renders subtitle and actions', () => {
    render(
      <PageChrome
        title="Audit"
        subtitle="1,284 events"
        actions={<button type="button">Export</button>}
      />,
    );
    expect(screen.getByText('1,284 events')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('renders toolbar slot', () => {
    render(
      <PageChrome
        title="Audit"
        toolbar={<PageChromeToolbar left={<span>Filters</span>} right={<span>Search</span>} />}
      />,
    );
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('renders children as scrollable body', () => {
    render(
      <PageChrome title="Audit">
        <div>body content</div>
      </PageChrome>,
    );
    expect(screen.getByText('body content')).toBeInTheDocument();
  });
});
