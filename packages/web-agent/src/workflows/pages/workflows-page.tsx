import {
  BreadcrumbItem,
  Breadcrumbs,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useState } from 'react';
import { DefinitionsList } from '../components/definitions-list.tsx';
import { RunsInbox } from '../components/runs-inbox.tsx';

export function WorkflowsPage() {
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/agent">Agent Studio</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Workflows</BreadcrumbItem>
            </Breadcrumbs>
            <HStack gap={2} vAlign="center">
              <Text as="h1" size="lg" weight="semibold">
                Workflows
              </Text>
              <Text color="secondary">Automations and their recent runs</Text>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="flex h-full">
            <DefinitionsList selectedId={definitionId} onSelect={setDefinitionId} />
            <main className="flex-1">
              <RunsInbox definitionId={definitionId} />
            </main>
          </div>
        </LayoutContent>
      }
    />
  );
}
