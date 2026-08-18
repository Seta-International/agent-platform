import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DisabledActionTooltip } from '../../../src/composites/disabled-action-tooltip';

function Row({ onRowClick, disabled }: { onRowClick: () => void; disabled: boolean }) {
  return (
    <table>
      <tbody>
        <tr onClick={onRowClick}>
          <td>
            <DisabledActionTooltip disabled={disabled} reason="You may not report on this project.">
              <button type="button" disabled={disabled}>
                Enter
              </button>
            </DisabledActionTooltip>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

describe('DisabledActionTooltip', () => {
  it('renders the child untouched when the action is available', () => {
    render(<Row onRowClick={() => {}} disabled={false} />);

    expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Enter' }).parentElement?.tagName).toBe('TD');
  });

  it('swallows a click on the disabled action instead of letting a clickable ancestor act', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<Row onRowClick={onRowClick} disabled={true} />);

    const wrapper = screen.getByRole('button', { name: 'Enter' }).parentElement as HTMLElement;
    await user.click(wrapper);

    expect(onRowClick).not.toHaveBeenCalled();
  });
});
