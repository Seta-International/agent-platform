import { FolderKanban } from 'lucide-react';
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
} from './_ui-compat.tsx';

/**
 * Shared "coming soon" screen for PM sections. One layout, parameterized by
 * section title/description so each route keeps its own breadcrumb + heading.
 */
export function PmComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/pm">Project Monitoring</BreadcrumbItem>
              <BreadcrumbItem isCurrent>{title}</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  {title}
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
            title={`${title} — coming soon`}
            description={description}
          />
        </LayoutContent>
      }
    />
  );
}
