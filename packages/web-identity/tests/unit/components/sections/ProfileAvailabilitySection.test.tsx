import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProfileDto } from '../../../../src/api/client.ts';
import { ProfileAvailabilitySection } from '../../../../src/components/ProfileAvailabilitySection.tsx';

function makeProfile(overrides: Partial<ProfileDto> = {}): ProfileDto {
  return {
    user_id: 'u-1',
    tenant_id: 't-1',
    display_name: 'Ada',
    email: 'ada@example.com',
    availability_status: 'available',
    ooo_until: null,
    timezone: 'UTC',
    working_hours: null,
    skills: [],
    bio: null,
    updated_at: '2026-06-01T00:00:00Z',
    deactivated_at: null,
    ...overrides,
  };
}

describe('ProfileAvailabilitySection', () => {
  it('renders the three availability options', () => {
    render(
      <ProfileAvailabilitySection profile={makeProfile()} onSave={vi.fn()} onUpdate={vi.fn()} />,
    );
    expect(screen.getByLabelText(/available/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/busy/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/out of office/i)).toBeInTheDocument();
  });

  it('calls onSave with availability_status and ooo_until patch, then onUpdate', async () => {
    const user = userEvent.setup();
    const updated = makeProfile({ availability_status: 'busy' });
    const onSave = vi.fn().mockResolvedValue(updated);
    const onUpdate = vi.fn();

    render(
      <ProfileAvailabilitySection
        profile={makeProfile({ availability_status: 'available' })}
        onSave={onSave}
        onUpdate={onUpdate}
      />,
    );

    await user.click(screen.getByLabelText(/busy/i));
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith({
      availability_status: 'busy',
      ooo_until: null,
    });
    expect(onUpdate).toHaveBeenCalledWith(updated);
  });

  it('shows ooo-until date picker when OOO is selected', async () => {
    const user = userEvent.setup();
    render(
      <ProfileAvailabilitySection profile={makeProfile()} onSave={vi.fn()} onUpdate={vi.fn()} />,
    );

    await user.click(screen.getByLabelText(/out of office/i));
    expect(screen.getByLabelText(/until/i)).toBeInTheDocument();
  });
});
