import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from './command';

const meta: Meta = { title: 'primitives/Command' };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <div className="w-[400px] rounded-md border border-hairline shadow-md">
      <Command>
        <CommandInput placeholder="Search commands…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="People">
            <CommandItem>
              View profile
              <CommandShortcut>⌘P</CommandShortcut>
            </CommandItem>
            <CommandItem>Edit employee record</CommandItem>
            <CommandItem>Send message</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Navigation">
            <CommandItem>
              Go to dashboard
              <CommandShortcut>⌘D</CommandShortcut>
            </CommandItem>
            <CommandItem>Open settings</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  ),
};
