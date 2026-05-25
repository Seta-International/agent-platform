import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProfileDto } from '../../../../../../src/modules/identity/api/client';
import { ProfileIdentityCard } from '../../../../../../src/modules/identity/components/profile/ProfileIdentityCard';

function makeProfile(overrides: Partial<ProfileDto> = {}): ProfileDto {
  return {
    user_id: 'u-1',
    tenant_id: 't-1',
    display_name: 'Ada Lovelace',
    email: 'ada@example.com',
    availability_status: 'available',
    ooo_until: null,
    timezone: 'UTC',
    working_hours: null,
    skills: [],
    bio: null,
    updated_at: '2026-05-24T00:00:00Z',
    deactivated_at: null,
    ...overrides,
  };
}

describe('ProfileIdentityCard bio', () => {
  it('shows the empty-state hint when bio is null', () => {
    render(<ProfileIdentityCard profile={makeProfile()} onSave={vi.fn()} onUpdate={vi.fn()} />);
    const textarea = screen.getByLabelText('Bio') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
    expect(textarea.placeholder).toMatch(/short bio/i);
  });

  it('pre-fills the textarea with the current bio', () => {
    render(
      <ProfileIdentityCard
        profile={makeProfile({ bio: 'Lead engineer on planner.' })}
        onSave={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    expect((screen.getByLabelText('Bio') as HTMLTextAreaElement).value).toBe(
      'Lead engineer on planner.',
    );
  });

  it('saves a bio patch and calls onUpdate with the server response', async () => {
    const user = userEvent.setup();
    const updated = makeProfile({ bio: 'New bio' });
    const onSave = vi.fn().mockResolvedValue(updated);
    const onUpdate = vi.fn();

    render(<ProfileIdentityCard profile={makeProfile()} onSave={onSave} onUpdate={onUpdate} />);

    await user.type(screen.getByLabelText('Bio'), 'New bio');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onSave).toHaveBeenCalledWith({ bio: 'New bio' });
    expect(onUpdate).toHaveBeenCalledWith(updated);
  });

  it('shows the character counter and caps at 500', async () => {
    const user = userEvent.setup();
    render(
      <ProfileIdentityCard
        profile={makeProfile({ bio: 'hello' })}
        onSave={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText('5 / 500')).toBeInTheDocument();

    const textarea = screen.getByLabelText('Bio') as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(500);

    await user.clear(textarea);
    await user.type(textarea, 'abc');
    expect(screen.getByText('3 / 500')).toBeInTheDocument();
  });
});
