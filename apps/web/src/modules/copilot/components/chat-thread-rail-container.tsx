import { ChatThreadRail, EmptyState } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useThreadList } from '../hooks/use-thread-list';
import { COPILOT_COPY } from '../i18n';

export function ChatThreadRailContainer({ activeThreadId }: { activeThreadId?: string }) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { groups, isLoading } = useThreadList();

  if (!isLoading && (!groups || groups.length === 0)) {
    return (
      <aside className="flex w-[260px] flex-none flex-col border-r border-hairline bg-surface-1">
        <EmptyState
          title={COPILOT_COPY.emptyThreads.title}
          description={COPILOT_COPY.emptyThreads.body}
          action={{
            label: COPILOT_COPY.newThread,
            onClick: () => void navigate({ to: '/copilot/chat', search: { thread: undefined } }),
          }}
        />
      </aside>
    );
  }

  return (
    <ChatThreadRail
      groups={groups ?? []}
      activeId={activeThreadId}
      onSelect={(id) => void navigate({ to: '/copilot/chat', search: { thread: id } })}
      onNewThread={() => void navigate({ to: '/copilot/chat', search: { thread: undefined } })}
      searchValue={search}
      onSearchChange={setSearch}
    />
  );
}
