import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from './top-bar';

describe('TopBar bell', () => {
  it('calls onBellClick when the bell is pressed', async () => {
    const onBellClick = vi.fn();
    render(<TopBar workspace="x" notificationCount={3} onBellClick={onBellClick} />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(onBellClick).toHaveBeenCalled();
  });

  it('renders the badge dot when notificationCount > 0', () => {
    render(<TopBar workspace="x" notificationCount={5} />);
    expect(screen.getByLabelText('Notifications (5)')).toBeInTheDocument();
  });
});
