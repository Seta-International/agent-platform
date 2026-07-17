import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsSurface } from '../../../src/pages/settings/settings-surface.tsx';

// SettingsSurface is the single change point for every /settings/* route (Profile, Roles,
// Skills, Availability, Security, Notifications) — a trail test here gates all of them at once.
describe('SettingsSurface — breadcrumb trail (Astryx migration)', () => {
  it('renders the Settings → <title> trail with the title as the only h1', () => {
    render(
      <SettingsSurface title="Profile">
        <div>body</div>
      </SettingsSurface>,
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'Settings' });
    expect(rootCrumb).toHaveAttribute('href', '/settings');

    // Current (terminal) crumb is the page's own title, not a link.
    expect(within(nav).getByText('Profile').closest('a')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
  });

  it('re-derives the trail per title so each settings route gets its own current crumb', () => {
    render(
      <SettingsSurface title="Security">
        <div>body</div>
      </SettingsSurface>,
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByText('Security').closest('a')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Security' })).toBeInTheDocument();
  });

  it('renders the body content passed as children', () => {
    render(
      <SettingsSurface title="Skills">
        <div>skills body content</div>
      </SettingsSurface>,
    );

    expect(screen.getByText('skills body content')).toBeInTheDocument();
  });
});
