import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ConfirmProvider, useConfirm } from '../../../src/composites/confirm';

function Probe({ onResult }: { onResult: (r: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={async () => {
        onResult(await confirm({ title: 'Delete chat?', description: "You can't undo this." }));
      }}
    >
      trigger
    </button>
  );
}

describe('ConfirmProvider / useConfirm', () => {
  it('resolves true when the action button is clicked', async () => {
    const user = userEvent.setup();
    let result: boolean | undefined;
    render(
      <ConfirmProvider>
        <Probe onResult={(r) => (result = r)} />
      </ConfirmProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'trigger' }));
    expect(await screen.findByText('Delete chat?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(result).toBe(true));
  });

  it('resolves false when cancelled', async () => {
    const user = userEvent.setup();
    let result: boolean | undefined;
    render(
      <ConfirmProvider>
        <Probe onResult={(r) => (result = r)} />
      </ConfirmProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'trigger' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(result).toBe(false));
  });

  it('throws when used without a provider', () => {
    function Bare() {
      useConfirm();
      return null;
    }
    // Silence React's error boundary log noise for the expected throw.
    expect(() => render(<Bare />)).toThrow(/ConfirmProvider/);
  });
});
