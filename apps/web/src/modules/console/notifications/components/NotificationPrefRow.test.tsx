import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationPrefRowDTO } from '../../../notifications/api/client.ts';
import { EMAIL_DEFERRED_HINT, NotificationPrefRow } from './NotificationPrefRow';

const baseRow: NotificationPrefRowDTO = {
  event_type: 'planner.task.assigned',
  label: 'Task assigned',
  in_app_enabled: true,
  email_enabled: false,
  email_available: false,
};

function renderInTable(ui: React.ReactNode) {
  return render(
    <table>
      <tbody>{ui}</tbody>
    </table>,
  );
}

describe('NotificationPrefRow', () => {
  it('renders the label and both toggles', () => {
    renderInTable(<NotificationPrefRow row={baseRow} onToggle={() => {}} />);
    expect(screen.getByText('Task assigned')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });

  it('flips in-app toggle through onToggle with the right channel', () => {
    const onToggle = vi.fn();
    renderInTable(<NotificationPrefRow row={baseRow} onToggle={onToggle} />);
    const [inAppSwitch] = screen.getAllByRole('switch');
    if (!inAppSwitch) throw new Error('expected in-app switch');
    fireEvent.click(inAppSwitch);
    expect(onToggle).toHaveBeenCalledWith({
      event_type: 'planner.task.assigned',
      channel: 'in_app',
      enabled: false,
    });
  });

  it('shows the v1.x chip when email_available is false', () => {
    renderInTable(<NotificationPrefRow row={baseRow} onToggle={() => {}} />);
    expect(screen.getByText('v1.x')).toBeInTheDocument();
    expect(screen.getByText('v1.x')).toHaveAttribute('title', EMAIL_DEFERRED_HINT);
  });

  it('omits the chip when email_available is true', () => {
    renderInTable(
      <NotificationPrefRow row={{ ...baseRow, email_available: true }} onToggle={() => {}} />,
    );
    expect(screen.queryByText('v1.x')).not.toBeInTheDocument();
  });
});
