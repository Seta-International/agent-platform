import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@seta/shared-ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

function allowFloatingLayerOutsideInteraction(e: Event): void {
  if (
    e.target instanceof Element &&
    e.target.closest(
      '[data-radix-popover-content], [data-radix-dropdown-menu-content], [data-radix-select-content]',
    )
  ) {
    e.preventDefault();
  }
}

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
      <DialogContent
        hideClose
        unstyled
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={allowFloatingLayerOutsideInteraction}
        onInteractOutside={allowFloatingLayerOutsideInteraction}
      >
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

function CreateClickHarness({ open, onCreate }: { open: boolean; onCreate: () => void }) {
  const [search, setSearch] = useState('');
  const trimmed = search.trim();
  return (
    <Dialog open>
      <DialogContent
        hideClose
        unstyled
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={allowFloatingLayerOutsideInteraction}
        onInteractOutside={allowFloatingLayerOutsideInteraction}
      >
        <DialogTitle className="sr-only">t</DialogTitle>
        <Popover open={open}>
          <PopoverTrigger asChild>
            <span />
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0">
            <Command shouldFilter={false}>
              <CommandInput
                aria-label="Filter labels"
                placeholder="Filter or create label"
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                {trimmed ? (
                  <CommandItem
                    value={`__create__${trimmed}`}
                    onSelect={() => {
                      onCreate();
                    }}
                  >
                    Create &ldquo;{trimmed}&rdquo;
                  </CommandItem>
                ) : null}
              </CommandList>
            </Command>
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

describe('clicking a Popover CommandItem inside a modal Dialog', () => {
  function ClickHarness({ open, onSelect }: { open: boolean; onSelect: () => void }) {
    return (
      <Dialog open>
        <DialogContent
          hideClose
          unstyled
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={allowFloatingLayerOutsideInteraction}
          onInteractOutside={allowFloatingLayerOutsideInteraction}
        >
          <DialogTitle className="sr-only">t</DialogTitle>
          <Popover open={open}>
            <PopoverTrigger asChild>
              <span />
            </PopoverTrigger>
            <PopoverContent className="p-0">
              <Command shouldFilter={false}>
                <CommandList>
                  <CommandItem value="alpha" onSelect={onSelect}>
                    alpha
                  </CommandItem>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </DialogContent>
      </Dialog>
    );
  }

  it('fires onSelect when the popover opens after the dialog', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(<ClickHarness open={false} onSelect={onSelect} />);
    rerender(<ClickHarness open={true} onSelect={onSelect} />);

    await user.click(await screen.findByRole('option', { name: 'alpha' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
  });

  it('fires onSelect on a create row after typing in the filter input', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const { rerender } = render(<CreateClickHarness open={false} onCreate={onCreate} />);
    rerender(<CreateClickHarness open={true} onCreate={onCreate} />);

    const input = await screen.findByLabelText('Filter labels');
    await user.type(input, 'shiny');
    await user.click(await screen.findByRole('option', { name: /Create.*shiny/i }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
  });
});
