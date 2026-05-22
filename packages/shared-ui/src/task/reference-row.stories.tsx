import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReferenceRow } from './reference-row';

const meta = { component: ReferenceRow } satisfies Meta<typeof ReferenceRow>;
export default meta;
type Story = StoryObj<typeof meta>;

const base = {
  id: 'r1',
  url: 'https://docs.acme.com/x',
  alias: 'Architecture notes',
  host: 'docs.acme.com',
};

export const Word: Story = {
  args: { refRow: { ...base, type: 'word' }, onOpen: () => {}, onRemove: () => {} },
};
export const Excel: Story = {
  args: {
    refRow: { ...base, alias: 'Q3 forecast.xlsx', type: 'excel' },
    onOpen: () => {},
    onRemove: () => {},
  },
};
export const PowerPoint: Story = {
  args: {
    refRow: { ...base, alias: 'Roadmap deck.pptx', type: 'powerPoint' },
    onOpen: () => {},
    onRemove: () => {},
  },
};
export const Web: Story = {
  args: {
    refRow: { ...base, alias: 'Linear changelog', host: 'linear.app', type: 'web' },
    onOpen: () => {},
    onRemove: () => {},
  },
};
export const Link: Story = {
  args: { refRow: { ...base, alias: null, type: 'link' }, onOpen: () => {}, onRemove: () => {} },
};
export const LongAlias: Story = {
  args: {
    refRow: {
      ...base,
      alias:
        'An extremely long alias that should truncate gracefully when the available row width is exceeded',
      type: 'word',
    },
    onOpen: () => {},
    onRemove: () => {},
  },
};
