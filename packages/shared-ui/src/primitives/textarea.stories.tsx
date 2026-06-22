import type { Meta, StoryObj } from '@storybook/react-vite';
import { Label } from './label';
import { Textarea } from './textarea';

const meta: Meta<typeof Textarea> = { title: 'primitives/Textarea', component: Textarea };
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-72">
      <div className="flex flex-col gap-1">
        <Label htmlFor="ta-default">Notes</Label>
        <Textarea id="ta-default" placeholder="Write something…" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ta-with-value">With value</Label>
        <Textarea
          id="ta-with-value"
          defaultValue="This is some existing content that spans multiple lines to show how the textarea handles longer text."
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ta-disabled">Disabled</Label>
        <Textarea id="ta-disabled" placeholder="Cannot edit" disabled />
      </div>
    </div>
  ),
};
