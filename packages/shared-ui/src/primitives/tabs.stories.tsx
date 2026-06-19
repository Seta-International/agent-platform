import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

const meta: Meta = { title: 'primitives/Tabs' };
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p className="text-body-sm text-ink-muted">Project overview and summary information.</p>
      </TabsContent>
      <TabsContent value="activity">
        <p className="text-body-sm text-ink-muted">Recent activity and timeline events.</p>
      </TabsContent>
      <TabsContent value="settings">
        <p className="text-body-sm text-ink-muted">Configuration and project settings.</p>
      </TabsContent>
    </Tabs>
  ),
};
