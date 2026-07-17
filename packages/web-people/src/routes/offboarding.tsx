import {
  BreadcrumbItem,
  Breadcrumbs,
  ComingSoon,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  Text,
  VStack,
} from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

function OffboardingPlaceholder() {
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/people">People</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Offboarding</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Offboarding
                </Text>
              </HStack>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="p-6">
            <ComingSoon feature="Offboarding" />
          </div>
        </LayoutContent>
      }
    />
  );
}

export const Route = createFileRoute('/_authed/people/offboarding')({
  component: OffboardingPlaceholder,
});
