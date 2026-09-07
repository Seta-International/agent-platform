import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { isMoraleTab, MoralePage, type MoraleTab } from '../../pages/morale-page.tsx';

export interface MoraleSearch {
  tab: MoraleTab;
}

export const Route = createFileRoute('/_authed/people/morale/')({
  // An unknown or absent `tab` falls back to the send form rather than erroring: the URL
  // is a bookmark, and a bad one should still open the page it names.
  validateSearch: (s: Record<string, unknown>): MoraleSearch => ({
    tab: isMoraleTab(s.tab) ? s.tab : 'send',
  }),
  component: MoraleRoute,
});

function MoraleRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <MoralePage
      tab={tab}
      // `replace` so flipping between tabs does not fill the back button with them —
      // Back should leave Morale, not walk the tab strip in reverse.
      onTabChange={(next) => navigate({ search: { tab: next }, replace: true })}
    />
  );
}
