import {
  BreadcrumbItem,
  Breadcrumbs,
  Card,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageContainer,
  Text,
  VStack,
} from '@seta/shared-ui';
import type { ReactNode } from 'react';

// Shared frame for every Settings page: the shell supplies the left nav, and
// this surface owns the "Settings › <title>" breadcrumb trail plus the title
// and body for every settings route.
export function SettingsSurface({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/settings">Settings</BreadcrumbItem>
              <BreadcrumbItem isCurrent>{title}</BreadcrumbItem>
            </Breadcrumbs>
            <Text as="h1" size="lg" weight="semibold">
              {title}
            </Text>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="bg-surface-1 min-h-full">
            <PageContainer className="space-y-5">{children}</PageContainer>
          </div>
        </LayoutContent>
      }
    />
  );
}

export function ComingSoonCard({ body }: { body: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-sm text-ink-subtle">{body}</p>
    </Card>
  );
}
