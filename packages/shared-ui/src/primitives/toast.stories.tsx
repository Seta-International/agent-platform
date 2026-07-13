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
      <Button variant="secondary" label="Default" onClick={() => toast('Event has been created')} />
      <Button variant="secondary" label="Success" onClick={() => toast.success('Changes saved')} />
      <Button
        variant="secondary"
        label="Error"
        onClick={() => toast.error('Something went wrong')}
      />
      <Button
        variant="secondary"
        label="With description"
        onClick={() => toast('Sync started', { description: 'Pulling tasks from Microsoft To Do' })}
      />
      <Button
        variant="secondary"
        label="With action"
        onClick={() =>
          toast('Task archived', {
            action: { label: 'Undo', onClick: () => toast('Restored') },
          })
        }
      />
      <Button
        variant="secondary"
        label="Promise"
        onClick={() =>
          toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
            loading: 'Saving…',
            success: 'Saved',
            error: 'Failed to save',
          })
        }
      />
    </div>
  ),
};
