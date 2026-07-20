import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Input } from '../primitives/input';
import { ExpandableRow } from './expandable-row';

const meta: Meta<typeof ExpandableRow> = {
  title: 'composites/ExpandableRow',
  component: ExpandableRow,
};
export default meta;
type Story = StoryObj<typeof ExpandableRow>;

export const Default: Story = {
  render: function Render() {
    const [expanded, setExpanded] = useState(false);
    const [name, setName] = useState('Alex Johnson');
    return (
      <ExpandableRow
        label="Legal name"
        value={name}
        isExpanded={expanded}
        onEdit={() => setExpanded(true)}
        onCancel={() => setExpanded(false)}
        onSave={() => setExpanded(false)}
      >
        <Input label="Legal name" isLabelHidden value={name} onChange={setName} />
      </ExpandableRow>
    );
  },
};
