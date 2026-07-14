import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProfileDto } from '../../../../src/api/client.ts';
import { ProfileIdentityCard } from '../../../../src/components/profile/ProfileIdentityCard.tsx';

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

  it('shows the character counter against the 500 limit', async () => {
    const user = userEvent.setup();
    render(
      <ProfileIdentityCard
        profile={makeProfile({ bio: 'hello' })}
        onSave={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    // Astryx TextArea's maxLength renders a live counter but does not enforce a
    // native HTML maxlength cap (see @astryxdesign/core TextArea.d.ts) — the
    // counter still tracks length accurately as the user types.
    expect(screen.getByText('5/500')).toBeInTheDocument();

    const textarea = screen.getByLabelText('Bio') as HTMLTextAreaElement;

    await user.clear(textarea);
    await user.type(textarea, 'abc');
    expect(screen.getByText('3/500')).toBeInTheDocument();
  });

  it('disables Save and shows an error status once an edit pushes bio past the 500 char limit', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(makeProfile());
    const startingBio = 'a'.repeat(495); // 5 chars of headroom before 500

    render(
      <ProfileIdentityCard
        profile={makeProfile({ bio: startingBio })}
        onSave={onSave}
        onUpdate={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText('Bio') as HTMLTextAreaElement;
    const saveButton = screen.getByRole('button', { name: /save changes/i });

    // Still within the limit and dirty (name edit) → Save is enabled.
    await user.type(screen.getByLabelText('Name'), '!');
    expect(saveButton).not.toBeDisabled();

    // Push the bio 10 chars past the limit.
    await user.type(textarea, '1234567890');
    expect(screen.getByText('505/500')).toBeInTheDocument();
    expect(screen.getByText(/bio cannot exceed 500 characters/i)).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    await user.click(saveButton);
    expect(onSave).not.toHaveBeenCalled();
  });
});
