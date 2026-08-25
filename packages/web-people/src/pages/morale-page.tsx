import {
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  Spinner,
  Tab,
  TabList,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { History } from 'lucide-react';
import type { ReactNode } from 'react';
import { moraleInboxOptions, moraleRecipientsOptions } from '../api/morale-query.ts';
import { MoraleInboxTab } from './morale-inbox-tab.tsx';
import { MoraleSendTab } from './morale-send-tab.tsx';
import { MoraleTrendTab } from './morale-trend-tab.tsx';

/** The three Morale surfaces. Also the `?tab=` values, so a tab can be linked to. */
export const MORALE_TABS = ['send', 'received', 'trend'] as const;
export type MoraleTab = (typeof MORALE_TABS)[number];

export function isMoraleTab(value: unknown): value is MoraleTab {
  return MORALE_TABS.includes(value as MoraleTab);
}

// ---- Chrome -------------------------------------------------------------

export function MoraleFrame({
  children,
  action,
  current,
  trail,
}: {
  children: ReactNode;
  action?: ReactNode;
  current: string;
  trail?: ReactNode;
}) {
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/people">People</BreadcrumbItem>
                {trail}
                <BreadcrumbItem isCurrent>{current}</BreadcrumbItem>
              </Breadcrumbs>
              <Text as="h1" size="lg" weight="semibold">
                {current}
              </Text>
            </VStack>
            {action}
          </HStack>
        </LayoutHeader>
      }
      content={<LayoutContent padding={4}>{children}</LayoutContent>}
    />
  );
}

// ---- Page ---------------------------------------------------------------

/**
 * Morale, as three tabs over one audience question: what you may send, what was sent to
 * you, and what the group as a whole reports.
 *
 * Notes Received and Morale Trend appear only for someone who can actually be a recipient
 * — HR, PMO, BoD, an account's AM, or a project's lead. That is decided server-side and
 * arrives with the send form, so the tab strip paints once in its final shape rather than
 * growing a tab a moment later.
 *
 * Controlled from the route so `?tab=` survives a reload and a tab can be linked to
 * directly; `tab` defaults to Send Notes for any caller that does not care.
 */
export function MoralePage({
  tab = 'send',
  onTabChange,
}: {
  tab?: MoraleTab;
  onTabChange?: (next: MoraleTab) => void;
} = {}) {
  const recipientsQuery = useQuery(moraleRecipientsOptions());
  const canReview = recipientsQuery.data?.can_review ?? false;

  // Deliberately unwindowed, unlike the list inside the tab: a badge that counted only
  // the last month would read as zero while unread notes from March sat waiting.
  const unreadQuery = useQuery({
    ...moraleInboxOptions({ unread_only: true }),
    enabled: canReview,
  });
  const unreadCount = unreadQuery.data?.total_notes ?? 0;

  if (recipientsQuery.isLoading) {
    return (
      <MoraleFrame current="Morale">
        <HStack hAlign="center">
          <Spinner />
        </HStack>
      </MoraleFrame>
    );
  }

  if (recipientsQuery.error) {
    return (
      <MoraleFrame current="Morale">
        <Banner status="error" title="Couldn't load Morale. Please try again." />
      </MoraleFrame>
    );
  }

  const canSubmit = recipientsQuery.data?.can_submit ?? false;
  // A stale `?tab=received` from a bookmark must not strand someone who lost the capacity.
  const active: MoraleTab = !canReview && tab !== 'send' ? 'send' : tab;

  // History is the record of what the send form submits, so the link belongs to that tab
  // and to people who have something in it.
  const action =
    active === 'send' && canSubmit ? (
      <Link to="/people/morale/history">
        <Button label="View history" variant="secondary" icon={<History size={16} />} />
      </Link>
    ) : undefined;

  return (
    <MoraleFrame current="Morale" action={action}>
      <VStack gap={3}>
        <TabList
          value={active}
          onChange={(next) => onTabChange?.(next as MoraleTab)}
          aria-label="Morale sections"
        >
          <Tab value="send" label="Send Notes" />
          {canReview && (
            <Tab
              value="received"
              label="Notes Received"
              endContent={
                unreadCount > 0 ? <Badge variant="info" label={unreadCount} /> : undefined
              }
            />
          )}
          {canReview && <Tab value="trend" label="Morale Trend" />}
        </TabList>

        {active === 'send' && (
          <MoraleSendTab canSubmit={canSubmit} groups={recipientsQuery.data?.groups ?? []} />
        )}
        {active === 'received' && <MoraleInboxTab />}
        {active === 'trend' && <MoraleTrendTab />}
      </VStack>
    </MoraleFrame>
  );
}
