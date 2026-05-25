import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AdminUserDetail } from '../../../../../../../src/modules/admin/users/api/users-client';
import { IdentityRailCard } from '../../../../../../../src/modules/admin/users/components/user-detail/IdentityRailCard';

function makeDetail(bio: string | null): AdminUserDetail {
  return {
    profile: {
      user_id: 'u-1',
      tenant_id: 't-1',
      display_name: 'Ada Lovelace',
      email: 'ada@example.com',
      availability_status: 'available',
      ooo_until: null,
      timezone: 'UTC',
      working_hours: null,
      skills: [],
      bio,
      updated_at: '2026-05-24T00:00:00Z',
      deactivated_at: null,
    },
    grants: [],
    sign_in_methods: ['credential'],
  };
}

describe('IdentityRailCard bio', () => {
  it('renders the About heading with the bio text', () => {
    render(<IdentityRailCard detail={makeDetail('Lead engineer on planner.')} />);
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Lead engineer on planner.')).toBeInTheDocument();
  });

  it('shows "No bio set." when bio is null', () => {
    render(<IdentityRailCard detail={makeDetail(null)} />);
    expect(screen.getByText(/no bio set/i)).toBeInTheDocument();
  });

  it('does not show a Show more toggle for short bios', () => {
    render(<IdentityRailCard detail={makeDetail('Short bio.')} />);
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  it('toggles Show more / Show less for long bios', async () => {
    const user = userEvent.setup();
    const longBio =
      'Line one of a longer bio.\nLine two adds context.\nLine three keeps going.\nLine four spills over.';
    render(<IdentityRailCard detail={makeDetail(longBio)} />);

    const moreBtn = screen.getByRole('button', { name: /show more/i });
    expect(moreBtn).toBeInTheDocument();
    await user.click(moreBtn);
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
  });
});
