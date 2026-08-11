import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ToastViewport, useToast } from '../../../src/primitives/toast';

function Harness() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast({ body: 'Saved successfully' })}>
        info
      </button>
      <button type="button" onClick={() => toast({ body: 'It broke', type: 'error' })}>
        error
      </button>
    </>
  );
}

// Toasts render into the ToastViewport, outside the component that raises them, so
// queries go through `screen`. Rendering the viewport as part of the tree (rather than
// letting useToast self-mount its fallback) is what keeps toasts from leaking between
// tests: cleanup() unmounts it, and Astryx only drops a toast on a `transitionend` that
// happy-dom never fires.
function renderHarness() {
  return render(
    <ToastViewport>
      <Harness />
    </ToastViewport>,
  );
}

describe('Astryx useToast under happy-dom', () => {
  it('shows an info toast in the viewport', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'info' }));
    const viewport = screen.getByRole('region', { name: 'Notifications' });
    // Matched by text, not role="status": every Astryx Button renders its own empty
    // role="status" live region, including the toast's own dismiss button.
    expect(await within(viewport).findByText('Saved successfully')).toBeInTheDocument();
  });

  // Scoped to the viewport, not `screen`: Astryx announces through a singleton
  // visually-hidden live region appended to document.body (useAnnounce), and the
  // assertive one also carries role="alert". Only the viewport holds real toasts.
  it('shows an error toast as role=alert', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'error' }));
    const viewport = screen.getByRole('region', { name: 'Notifications' });
    expect(await within(viewport).findByRole('alert')).toHaveTextContent('It broke');
  });

  it('does not leak toasts from earlier tests', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'error' }));
    const viewport = screen.getByRole('region', { name: 'Notifications' });
    expect(await within(viewport).findAllByRole('alert')).toHaveLength(1);
  });
});
