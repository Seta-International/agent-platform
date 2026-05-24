import { ChatThreadRail } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useThreadList } from '../hooks/use-thread-list';

interface CopilotThreadRailProps {
  activeThreadId?: string;
  onAfterNavigate?: () => void;
  className?: string;
}

export function CopilotThreadRail({
  activeThreadId,
  onAfterNavigate,
  className,
}: CopilotThreadRailProps) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { groups } = useThreadList();

  return (
    <ChatThreadRail
      groups={groups ?? []}
      activeId={activeThreadId}
      onSelect={(id) => {
        void navigate({ to: '/copilot/chat', search: { thread: id } });
        onAfterNavigate?.();
      }}
      onNewThread={() => {
        void navigate({ to: '/copilot/chat', search: { thread: undefined } });
        onAfterNavigate?.();
      }}
      searchValue={search}
      onSearchChange={setSearch}
      className={className}
    />
  );
}
