import type { Meta, StoryObj } from '@storybook/react-vite';
import { SyncBadge, type SyncState } from './sync-badge';

const meta: Meta<typeof SyncBadge> = { title: 'composites/SyncBadge', component: SyncBadge };
export default meta;
type Story = StoryObj<typeof SyncBadge>;

const STATES: SyncState[] = ['idle', 'pulling', 'pushing', 'error', 'conflict'];

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {STATES.map((s) => (
        <SyncBadge key={s} state={s} synced_at={new Date().toISOString()} />
      ))}
    </div>
  ),
};

export const Mini: Story = {
  render: () => (
    <div className="flex gap-2">
      {STATES.map((s) => (
        <SyncBadge key={s} state={s} synced_at={new Date().toISOString()} size="mini" />
      ))}
    </div>
  ),
};

export const WithLink: Story = {
  render: () => (
    <SyncBadge
      state="idle"
      synced_at={new Date().toISOString()}
      linkUrl="https://tasks.office.com"
    />
  ),
};
