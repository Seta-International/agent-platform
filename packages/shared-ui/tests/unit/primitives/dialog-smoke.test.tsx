import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog isOpen={open} onOpenChange={setOpen} purpose="form">
        <Layout
          header={<DialogHeader title="Smoke" onOpenChange={setOpen} />}
          content={<LayoutContent>Dialog body</LayoutContent>}
        />
      </Dialog>
    </>
  );
}

describe('Astryx Dialog under happy-dom', () => {
  it('exposes the dialog role only when open and closes via the header button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    // Closed: content is mounted (Astryx Dialog does not unmount on close) but the
    // native <dialog> has no `open` attribute, so it carries no accessible role.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Dialog body')).toBeInTheDocument();
    // Close button is the DialogHeader's (rendered because onOpenChange was passed).
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
