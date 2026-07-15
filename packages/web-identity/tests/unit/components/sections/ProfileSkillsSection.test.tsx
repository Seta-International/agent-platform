import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDto } from '../../../../src/api/client.ts';
import { ProfileSkillsSection } from '../../../../src/components/ProfileSkillsSection.tsx';

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
    skills: [{ id: 's-ts', name: 'TypeScript', level: null }],
    bio: null,
    updated_at: '2026-06-01T00:00:00Z',
    deactivated_at: null,
    ...overrides,
  };
}

describe('ProfileSkillsSection', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders existing skills as badges', () => {
    render(
      <ProfileSkillsSection
        profile={makeProfile({
          skills: [
            { id: 's-ts', name: 'TypeScript', level: null },
            { id: 's-react', name: 'React', level: null },
          ],
        })}
        onSave={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
  });

  it('calls onSave with skills array and calls onUpdate', async () => {
    const user = userEvent.setup();
    const clientModule = await import('../../../../src/api/client.ts');
    vi.spyOn(clientModule, 'searchSkillsApi').mockResolvedValue(['Go']);

    const updated = makeProfile({ skills: [{ id: 's-go', name: 'Go', level: null }] });
    const onSave = vi.fn().mockResolvedValue(updated);
    const onUpdate = vi.fn();

    render(
      <ProfileSkillsSection
        profile={makeProfile({ skills: [{ id: 's-ts', name: 'TypeScript', level: null }] })}
        onSave={onSave}
        onUpdate={onUpdate}
      />,
    );

    // Remove TypeScript, add catalog skill "Go"
    await user.click(screen.getByRole('button', { name: /remove typescript/i }));
    const input = screen.getByPlaceholderText(/search to add a skill/i);
    await user.type(input, 'Go');
    const option = await screen.findByRole('option', { name: 'Go' });
    await user.click(option);

    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith({ skills: ['Go'] });
    expect(onUpdate).toHaveBeenCalledWith(updated);
  });

  it('shows catalog suggestions from searchSkillsApi when typing', async () => {
    const user = userEvent.setup();

    // Mock searchSkillsApi by spying on the module
    const clientModule = await import('../../../../src/api/client.ts');
    const searchSpy = vi.spyOn(clientModule, 'searchSkillsApi').mockResolvedValue(['Rust', 'Ruby']);

    render(
      <ProfileSkillsSection
        profile={makeProfile({ skills: [] })}
        onSave={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText(/search to add a skill/i);
    await user.click(input);
    await user.type(input, 'ru');

    // Wait for debounce (200ms)
    await new Promise((r) => setTimeout(r, 300));

    expect(searchSpy).toHaveBeenCalledWith('ru');
  });

  it('adds the canonical catalog name when a suggestion is selected', async () => {
    const user = userEvent.setup();
    const clientModule = await import('../../../../src/api/client.ts');
    vi.spyOn(clientModule, 'searchSkillsApi').mockResolvedValue(['TypeScript']);

    render(
      <ProfileSkillsSection
        profile={makeProfile({ skills: [] })}
        onSave={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText(/search to add a skill/i);
    await user.click(input);
    await user.type(input, 'type');
    const option = await screen.findByRole('option', { name: 'TypeScript' });
    await user.click(option);
    // draft grid now shows the canonical name
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('typing a query with no catalog match yields no option and no draft entry', async () => {
    const user = userEvent.setup();
    const clientModule = await import('../../../../src/api/client.ts');
    vi.spyOn(clientModule, 'searchSkillsApi').mockResolvedValue([]); // no catalog match

    render(
      <ProfileSkillsSection
        profile={makeProfile({ skills: [] })}
        onSave={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText(/search to add a skill/i);
    await user.click(input);
    await user.type(input, 'notacatalogskill');
    await new Promise((r) => setTimeout(r, 300)); // debounce -> suggestions = []

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.queryByText('notacatalogskill')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('does not add a skill when Enter is pressed without selecting an option', async () => {
    const user = userEvent.setup();
    const clientModule = await import('../../../../src/api/client.ts');
    vi.spyOn(clientModule, 'searchSkillsApi').mockResolvedValue(['TypeScript']);

    render(
      <ProfileSkillsSection
        profile={makeProfile({ skills: [] })}
        onSave={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText(/search to add a skill/i);
    await user.click(input);
    await user.type(input, 'TypeScript');
    await user.keyboard('{Enter}'); // no option clicked
    // No draft entry was created (no remove-button for the skill) and Save stays disabled.
    expect(screen.queryByRole('button', { name: /remove typescript/i })).toBeNull();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });
});
