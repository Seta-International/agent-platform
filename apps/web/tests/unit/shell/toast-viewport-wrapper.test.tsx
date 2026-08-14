import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastViewportWrapper } from '../../../src/shell/toast-viewport-wrapper';

describe('ToastViewportWrapper (FUT-830)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders ToastViewport cleanly with popover="manual"', () => {
    const { container } = render(<ToastViewportWrapper />);
    const region = screen.getByRole('region');
    expect(region).toBeDefined();
    expect(container.contains(region)).toBe(true);
    expect(region.getAttribute('popover')).toBe('manual');
  });

  it('re-promotes popover when an open dialog is detected', async () => {
    const showPopoverSpy = vi.fn();
    const hidePopoverSpy = vi.fn();

    const popoverDiv = document.createElement('div');
    popoverDiv.setAttribute('popover', 'manual');
    popoverDiv.setAttribute('role', 'region');
    popoverDiv.setAttribute('aria-label', 'Notifications (Toasts)');
    popoverDiv.showPopover = showPopoverSpy;
    popoverDiv.hidePopover = hidePopoverSpy;
    document.body.appendChild(popoverDiv);

    render(<ToastViewportWrapper />);

    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(hidePopoverSpy).toHaveBeenCalled();
    expect(showPopoverSpy).toHaveBeenCalled();
  });
});
