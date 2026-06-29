import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

const meta: Meta = { title: 'primitives/Sheet' };
export default meta;
type Story = StoryObj;

export const Right: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">Open right sheet</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Update your display name and notification preferences. Changes are saved automatically.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="sheet-display-name">Display name</Label>
            <Input id="sheet-display-name" defaultValue="Jane Smith" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="sheet-email">Email</Label>
            <Input id="sheet-email" type="email" defaultValue="jane@example.com" />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="secondary">Cancel</Button>
          </SheetClose>
          <Button>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">Open left sheet</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Quick access to your workspaces and projects.</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-1 py-4">
          {['Dashboard', 'Projects', 'People', 'Settings'].map((item) => (
            <button
              type="button"
              key={item}
              className="rounded-md px-3 py-2 text-left text-body-sm text-ink hover:bg-surface-2"
            >
              {item}
            </button>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  ),
};
