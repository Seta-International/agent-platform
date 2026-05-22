import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SyncState } from './sync-badge';
import { SyncBadge } from './sync-badge';

describe('SyncBadge', () => {
  it('renders nothing when state is null', () => {
    const { container } = render(<SyncBadge state={null} synced_at={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "Pulling…" for pulling state', () => {
    const { getByText } = render(<SyncBadge state="pulling" synced_at={null} />);
    expect(getByText('Pulling…')).toBeInTheDocument();
  });

  it('renders "Sync failed" for error state', () => {
    const { getByText } = render(<SyncBadge state="error" synced_at={null} />);
    expect(getByText('Sync failed')).toBeInTheDocument();
  });

  it('renders "Conflict" for conflict state', () => {
    const { getByText } = render(<SyncBadge state="conflict" synced_at={null} />);
    expect(getByText('Conflict')).toBeInTheDocument();
  });

  it('renders "Synced never" for idle without timestamp', () => {
    // Or "Synced"; assert it starts with Synced
    const { container } = render(<SyncBadge state="idle" synced_at={null} />);
    expect(container.textContent).toMatch(/^Synced/);
  });

  it('renders relative timestamp for idle with synced_at', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const { container } = render(<SyncBadge state="idle" synced_at={tenMinAgo} />);
    expect(container.textContent).toMatch(/^Synced /);
  });
});

describe('SyncBadge — PR4 extensions', () => {
  it('renders the pushing state', () => {
    const { getByText } = render(<SyncBadge state="pushing" synced_at={null} />);
    expect(getByText('Pushing…')).toBeInTheDocument();
  });

  it('pulling and pushing have role=status', () => {
    const { rerender, getByRole } = render(<SyncBadge state="pulling" synced_at={null} />);
    expect(getByRole('status')).toBeInTheDocument();
    rerender(<SyncBadge state="pushing" synced_at={null} />);
    expect(getByRole('status')).toBeInTheDocument();
  });

  it('renders as a link when linkUrl is provided', () => {
    const { getByRole } = render(
      <SyncBadge state="idle" synced_at={null} linkUrl="https://tasks.office.com/x/y" />,
    );
    expect(getByRole('link')).toHaveAttribute('href', 'https://tasks.office.com/x/y');
    expect(getByRole('link')).toHaveAttribute('target', '_blank');
    expect(getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('mini variant — dot only, no text, has aria-label', () => {
    const { container, getByRole, queryByText } = render(
      <SyncBadge state="error" synced_at={null} size="mini" />,
    );
    expect(container.querySelector('[data-sync-badge-mini="true"]')).toBeInTheDocument();
    expect(getByRole('status')).toHaveAttribute('aria-label', 'Sync error');
    expect(queryByText(/sync failed/i)).not.toBeInTheDocument();
  });

  it('mini + linkUrl together still renders the link wrapper', () => {
    const { getByRole, container } = render(
      <SyncBadge state="idle" synced_at={null} size="mini" linkUrl="https://example.com" />,
    );
    expect(getByRole('link')).toHaveAttribute('href', 'https://example.com');
    expect(container.querySelector('[data-sync-badge-mini="true"]')).toBeInTheDocument();
  });
});
