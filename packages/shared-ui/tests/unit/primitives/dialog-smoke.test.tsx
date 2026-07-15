import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogHeader, Layout, LayoutContent } from '../../../src';

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
  it('renders content only when open and closes via the header button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    // Closed: Dialog returns null.
    expect(screen.queryByText('Dialog body')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('Dialog body')).toBeInTheDocument();
    // Close button is the DialogHeader's (rendered because onOpenChange was passed).
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText('Dialog body')).not.toBeInTheDocument();
  });
});
