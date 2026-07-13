import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { Card, CardDescription, CardTitle } from './card';
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from './layout';

const meta: Meta<typeof Card> = { title: 'primitives/Card', component: Card };
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card width={320}>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card description goes here.</CardDescription>
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <p className="text-body-sm text-ink-muted">Card content area with some body text.</p>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Button size="sm">Action</Button>
          </LayoutFooter>
        }
      />
    </Card>
  ),
};

export const Muted: Story = {
  render: () => (
    <Card variant="muted" width={320}>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <CardTitle>Muted Card</CardTitle>
            <CardDescription>A de-emphasised card variant.</CardDescription>
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <p className="text-body-sm text-ink-muted">Content and description here.</p>
          </LayoutContent>
        }
      />
    </Card>
  ),
};

export const Transparent: Story = {
  render: () => (
    <Card variant="transparent" width={320}>
      <p>&ldquo;This product has transformed how our team collaborates day to day.&rdquo;</p>
      <div className="mt-4 flex items-center gap-3">
        <div className="text-body-sm">
          <p className="font-semibold text-ink">Jane Doe</p>
          <p className="text-ink-subtle">Head of Operations</p>
        </div>
      </div>
    </Card>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Card variant="default" width={320}>
        <Layout
          header={
            <LayoutHeader hasDivider>
              <CardTitle>Default</CardTitle>
              <CardDescription>standard card background with visible border</CardDescription>
            </LayoutHeader>
          }
        />
      </Card>
      <Card variant="blue" width={320}>
        <Layout
          header={
            <LayoutHeader hasDivider>
              <CardTitle>Blue</CardTitle>
              <CardDescription>non-semantic palette tint</CardDescription>
            </LayoutHeader>
          }
        />
      </Card>
      <Card variant="muted" width={320}>
        <p className="text-body-lg">&ldquo;Muted variant with larger text.&rdquo;</p>
      </Card>
    </div>
  ),
};
