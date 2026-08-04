import { Dialog } from '@astryxdesign/core/Dialog';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastViewport, useToast } from '../../../src/primitives/toast';

function Harness() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast({ body: 'Saved successfully' })}>
        info
      </button>
    </>
  );
}

// The viewport div Astryx mounts (popover="manual", role=region, aria-label="Notifications").
const VIEWPORT_SELECTOR = '[role="region"][aria-label="Notifications"]';

describe('ToastViewport re-promote above dialogs', () => {
  beforeEach(() => {
    // Simulate the browser's showPopover/hidePopover so the observer path (hide+show)
    // is observable/orderable under happy-dom.
    const proto = window.HTMLDivElement.prototype;
    if (!(proto as { __showPopoverSpied?: boolean }).__showPopoverSpied) {
      (proto as { __showPopoverSpied?: boolean }).__showPopoverSpied = true;
      proto.showPopover = function showPopover(this: HTMLDivElement) {
        this.setAttribute('popover-open', '');
      };
      proto.hidePopover = function hidePopover(this: HTMLDivElement) {
        this.removeAttribute('popover-open');
      };
    }
  });

  it('shows a toast in the viewport (sanity — wrapper still renders toasts)', async () => {
    const user = userEvent.setup();
    render(
      <ToastViewport>
        <Harness />
      </ToastViewport>,
    );
    await user.click(screen.getByRole('button', { name: 'info' }));
    expect(await screen.findByText('Saved successfully')).toBeInTheDocument();
  });

  it('re-promotes the viewport when a modal dialog is added to the DOM', async () => {
    const showPopover = vi.spyOn(window.HTMLDivElement.prototype, 'showPopover');
    const hidePopover = vi.spyOn(window.HTMLDivElement.prototype, 'hidePopover');

    render(
      <ToastViewport>
        <Harness />
      </ToastViewport>,
    );
    const viewport = document.querySelector<HTMLDivElement>(VIEWPORT_SELECTOR);
    expect(viewport).not.toBeNull();
    // Drop the mount-time showPopover so we assert only the re-promotion.
    showPopover.mockClear();
    hidePopover.mockClear();

    // Simulate a dialog joining the top layer after the viewport mounted.
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);

    // hidePopover()+showPopover() is the re-promotion mechanism — observer is async.
    await waitFor(() => expect(hidePopover).toHaveBeenCalled());
    expect(showPopover).toHaveBeenCalled();
    dialog.remove();
  });

  it('re-promotes when an already-mounted dialog flips open (attribute mutation)', async () => {
    const showPopover = vi.spyOn(window.HTMLDivElement.prototype, 'showPopover');
    const hidePopover = vi.spyOn(window.HTMLDivElement.prototype, 'hidePopover');

    render(
      <ToastViewport>
        <Harness />
      </ToastViewport>,
    );
    showPopover.mockClear();
    hidePopover.mockClear();

    // A dialog already in the DOM (kept mounted by Astryx), not yet open.
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    await new Promise((r) => setTimeout(r, 0));

    // Opening it sets `open` — the re-promotion trigger.
    dialog.setAttribute('open', '');
    await waitFor(() => expect(hidePopover).toHaveBeenCalled());
    expect(showPopover).toHaveBeenCalled();
    dialog.remove();
  });

  it('does not re-promote for unrelated DOM additions', async () => {
    const showPopover = vi.spyOn(window.HTMLDivElement.prototype, 'showPopover');

    render(
      <ToastViewport>
        <Harness />
      </ToastViewport>,
    );
    showPopover.mockClear();

    const button = document.createElement('button');
    document.body.appendChild(button);
    await new Promise((r) => setTimeout(r, 0));
    expect(showPopover).not.toHaveBeenCalled();
    button.remove();
  });

  it('works with a real Astryx Dialog opening (integration)', async () => {
    const user = userEvent.setup();
    const showPopover = vi.spyOn(window.HTMLDivElement.prototype, 'showPopover');

    function WithDialog() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open dialog
          </button>
          <Dialog
            isOpen={open}
            onOpenChange={setOpen}
            title="Confirm"
            description="Are you sure?"
            cancelLabel="Cancel"
            actionLabel="OK"
          />
        </>
      );
    }

    render(
      <ToastViewport>
        <WithDialog />
      </ToastViewport>,
    );
    // Observer is armed (no dialog yet) — clear the mount-time call.
    showPopover.mockClear();

    await user.click(screen.getByRole('button', { name: 'open dialog' }));

    // Opening the dialog re-promotes the viewport.
    expect(showPopover).toHaveBeenCalled();
  });
});
