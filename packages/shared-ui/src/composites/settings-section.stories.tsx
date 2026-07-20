import type { Meta, StoryObj } from '@storybook/react-vite';
import { Text } from '../primitives/text';
import { SettingsSection } from './settings-section';

const meta: Meta<typeof SettingsSection> = {
  title: 'composites/SettingsSection',
  component: SettingsSection,
};
export default meta;
type Story = StoryObj<typeof SettingsSection>;

export const Default: Story = {
  render: () => (
    <SettingsSection title="Login" description="Choose how people sign in.">
      <Text display="block">Row content goes here</Text>
    </SettingsSection>
  ),
};
