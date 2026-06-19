import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

const meta: Meta<typeof Card> = { title: 'primitives/Card', component: Card };
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-body-sm text-ink-muted">Card content area with some body text.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Action</Button>
      </CardFooter>
    </Card>
  ),
};

export const Product: Story = {
  render: () => (
    <Card variant="product" className="w-80">
      <CardHeader>
        <CardTitle>Product Card</CardTitle>
        <CardDescription>A product-style card with rounded-lg corners.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-body-sm text-ink-muted">Product details and description here.</p>
      </CardContent>
    </Card>
  ),
};

export const Testimonial: Story = {
  render: () => (
    <Card variant="testimonial" className="w-80">
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
      <Card variant="default" className="w-80">
        <CardHeader>
          <CardTitle>Default</CardTitle>
          <CardDescription>rounded-md padding</CardDescription>
        </CardHeader>
      </Card>
      <Card variant="product" className="w-80">
        <CardHeader>
          <CardTitle>Product</CardTitle>
          <CardDescription>rounded-lg padding</CardDescription>
        </CardHeader>
      </Card>
      <Card variant="testimonial" className="w-80">
        <p className="text-body-lg">&ldquo;Testimonial variant with larger text.&rdquo;</p>
      </Card>
    </div>
  ),
};
