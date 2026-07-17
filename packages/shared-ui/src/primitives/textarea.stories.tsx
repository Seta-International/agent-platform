import type { Meta, StoryObj } from '@storybook/react-vite';
import { Textarea } from './textarea';

const meta: Meta<typeof Textarea> = { title: 'primitives/Textarea', component: Textarea };
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-72">
      <Textarea label="Notes" value="" placeholder="Write something…" />
      <Textarea
        label="With value"
        value="This is some existing content that spans multiple lines to show how the textarea handles longer text."
      />
      <Textarea label="Disabled" value="" placeholder="Cannot edit" isDisabled />
    </div>
  ),
};
