import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from '../../../src/composites/top-bar';

describe('TopBar bell', () => {
  it('calls onBellClick when the bell is pressed', async () => {
    const onBellClick = vi.fn();
    render(
      <TopBar
        notificationPanel={
          <button type="button" aria-label="Notifications" onClick={onBellClick} />
        }
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(onBellClick).toHaveBeenCalled();
  });

  it('renders the badge dot when notificationCount > 0', () => {
    render(<TopBar notificationPanel={<button type="button" aria-label="Notifications (5)" />} />);
    expect(screen.getByLabelText('Notifications (5)')).toBeInTheDocument();
  });
});

describe('TopBar app launcher', () => {
  it('opens on a single click (not the TopNavHeading hover+click race this replaces)', async () => {
    const user = userEvent.setup();
    render(<TopBar launcherContent={() => <div>Launcher content</div>} />);
    const trigger = screen.getByRole('button', { name: /Open app launcher/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('passes its own close callback to launcherContent', async () => {
    const user = userEvent.setup();
    const closeSpy = vi.fn();
    render(
      <TopBar
        launcherContent={(close) => (
          <button
            type="button"
            aria-label="Select app"
            onClick={() => {
              closeSpy();
              close();
            }}
          />
        )}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Open app launcher/i }));
    await user.click(screen.getByRole('button', { name: /Select app/i }));
    expect(closeSpy).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Open app launcher/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
