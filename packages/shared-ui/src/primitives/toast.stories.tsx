import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { Toaster, toast } from './toast';

const meta: Meta<typeof Toaster> = { title: 'primitives/Toast', component: Toaster };
export default meta;
type Story = StoryObj<typeof Toaster>;

export const Default: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Toaster />
      <Button variant="secondary" onClick={() => toast('Event has been created')}>
        Default
      </Button>
      <Button variant="secondary" onClick={() => toast.success('Changes saved')}>
        Success
      </Button>
      <Button variant="secondary" onClick={() => toast.error('Something went wrong')}>
        Error
      </Button>
      <Button
        variant="secondary"
        onClick={() => toast('Sync started', { description: 'Pulling tasks from Microsoft To Do' })}
      >
        With description
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast('Task archived', {
            action: { label: 'Undo', onClick: () => toast('Restored') },
          })
        }
      >
        With action
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
            loading: 'Saving…',
            success: 'Saved',
            error: 'Failed to save',
          })
        }
      >
        Promise
      </Button>
    </div>
  ),
};
