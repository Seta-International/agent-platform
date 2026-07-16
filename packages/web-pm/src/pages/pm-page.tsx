import {
  BreadcrumbItem,
  Breadcrumbs,
  EmptyState,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  Text,
  VStack,
} from '@seta/shared-ui';
import { FolderKanban } from 'lucide-react';

export function PmPage() {
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/pm">Project Monitoring</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Project Management</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Project Management
                </Text>
              </HStack>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <EmptyState
            icon={<FolderKanban className="size-6" />}
            title="Project Management — coming soon"
            description="Projects, milestones, and task boards will appear here."
          />
        </LayoutContent>
      }
    />
  );
}
