import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';

const meta: Meta<typeof Button> = { title: 'primitives/Button', component: Button };
export default meta;
type Story = StoryObj<typeof Button>;

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" label="Primary" />
      <Button variant="secondary" label="Secondary" />
      <Button variant="ghost" label="Ghost" />
      <Button variant="destructive" label="Destructive" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center flex-wrap gap-2">
      <Button size="sm" label="Small" />
      <Button size="md" label="Medium" />
      <Button size="lg" label="Large" />
      <Button size="sm" isIconOnly icon={<span>⚙</span>} label="Settings" />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" isDisabled label="Primary" />
      <Button variant="secondary" isDisabled label="Secondary" />
      <Button variant="destructive" isDisabled label="Destructive" />
    </div>
  ),
};

export const Default: Story = {
  render: () => <Button label="Click me" />,
};
