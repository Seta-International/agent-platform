import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

const meta: Meta = { title: 'primitives/Dialog' };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" label="Open dialog" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive project</DialogTitle>
          <DialogDescription>
            This will archive the project and hide it from your active list. You can restore it
            later from settings.
          </DialogDescription>
        </DialogHeader>
        <p className="text-body-sm text-ink-subtle">
          Archived projects retain all data and remain searchable. Team members lose access until
          the project is restored.
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" label="Cancel" />
          </DialogClose>
          <Button variant="destructive" label="Archive" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const NoCloseButton: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" label="Open (no X)" />
      </DialogTrigger>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>Confirm action</DialogTitle>
          <DialogDescription>You must choose an option to proceed.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" label="Cancel" />
          </DialogClose>
          <Button label="Confirm" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
