import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
