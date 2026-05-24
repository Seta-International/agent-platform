import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationPrefRow } from '../../../../../../src/modules/admin/notifications/components/NotificationPrefRow';
import type { NotificationPrefRowDTO } from '../../../../../../src/modules/notifications/api/client.ts';

const baseRow: NotificationPrefRowDTO = {
  event_type: 'planner.task.assigned',
  label: 'Task assigned',
  in_app_enabled: true,
  email_enabled: false,
  email_available: false,
};

describe('NotificationPrefRow', () => {
  it('renders the label and both toggles', () => {
    render(<NotificationPrefRow row={baseRow} onToggle={() => {}} />);
    expect(screen.getByText('Task assigned')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });

  it('flips in-app toggle through onToggle with the right channel', () => {
    const onToggle = vi.fn();
    render(<NotificationPrefRow row={baseRow} onToggle={onToggle} />);
    const [inAppSwitch] = screen.getAllByRole('switch');
    if (!inAppSwitch) throw new Error('expected in-app switch');
    fireEvent.click(inAppSwitch);
    expect(onToggle).toHaveBeenCalledWith({
      event_type: 'planner.task.assigned',
      channel: 'in_app',
      enabled: false,
    });
  });

  it('disables the email switch when email_available is false', () => {
    render(<NotificationPrefRow row={baseRow} onToggle={() => {}} />);
    const [, emailSwitch] = screen.getAllByRole('switch');
    if (!emailSwitch) throw new Error('expected email switch');
    expect(emailSwitch).toBeDisabled();
  });

  it('enables the email switch when email_available is true', () => {
    render(<NotificationPrefRow row={{ ...baseRow, email_available: true }} onToggle={() => {}} />);
    const [, emailSwitch] = screen.getAllByRole('switch');
    if (!emailSwitch) throw new Error('expected email switch');
    expect(emailSwitch).not.toBeDisabled();
  });
});
