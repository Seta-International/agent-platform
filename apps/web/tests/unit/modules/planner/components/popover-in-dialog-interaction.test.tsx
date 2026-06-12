import {
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@seta/shared-ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

// Regression for the reported bug: in the task-details MODAL (a Radix Dialog),
// the label rename field can't be typed into; on the full page it works. Root
// cause: a modal Dialog sets `pointer-events: none` on <body>, and PopoverContent
// is portaled to <body> (outside the dialog), so it inherits that and becomes
// non-interactive. PopoverContent now re-enables pointer-events; this pins the
// mechanism with a plain <Input> inside our <Popover> inside a modal <Dialog>.
// The popover opens AFTER the dialog (the real flow), simulated via rerender so
// it doesn't depend on jsdom's flaky deferred popover-open behaviour.
function Harness({ open }: { open: boolean }) {
  return (
    <Dialog open>
      <DialogContent hideClose unstyled onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogTitle className="sr-only">t</DialogTitle>
        <Popover open={open}>
          <PopoverTrigger asChild>
            <span />
          </PopoverTrigger>
          <PopoverContent>
            <Input aria-label="rename" />
          </PopoverContent>
        </Popover>
      </DialogContent>
    </Dialog>
  );
}

describe('typing into a Popover input inside a modal Dialog', () => {
  it('control: typing into a popover input with NO dialog works', async () => {
    const user = userEvent.setup();
    render(
      <Popover open>
        <PopoverTrigger asChild>
          <span />
        </PopoverTrigger>
        <PopoverContent>
          <Input aria-label="rename" />
        </PopoverContent>
      </Popover>,
    );
    const input = await screen.findByLabelText('rename');
    await user.type(input, 'Defect');
    expect(input).toHaveValue('Defect');
  });

  it('lets the user type into the popover input (popover opened after the dialog)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness open={false} />);
    // Dialog is mounted first with the popover closed, then the popover opens —
    // mirroring a user opening the label picker inside an already-open modal.
    rerender(<Harness open={true} />);

    const input = await screen.findByLabelText('rename');
    await user.type(input, 'Defect');
    expect(input).toHaveValue('Defect');
  });
});
