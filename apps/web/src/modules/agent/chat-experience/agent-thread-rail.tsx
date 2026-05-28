import { ChatThreadRail } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useThreadList } from '../hooks/use-thread-list';
import { useAgentSelection } from './agent-provider';

interface AgentThreadRailProps {
  activeThreadId?: string;
  onAfterNavigate?: () => void;
  className?: string;
}

export function AgentThreadRail({
  activeThreadId,
  onAfterNavigate,
  className,
}: AgentThreadRailProps) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { groups } = useThreadList();
  const { actions } = useAgentSelection();

  return (
    <ChatThreadRail
      groups={groups ?? []}
      activeId={activeThreadId}
      onSelect={(id) => {
        void navigate({ to: '/agent/chat', search: { thread: id } });
        onAfterNavigate?.();
      }}
      onNewThread={() => {
        const id = actions.startFreshThread();
        void navigate({ to: '/agent/chat', search: { thread: id }, replace: true });
        onAfterNavigate?.();
      }}
      searchValue={search}
      onSearchChange={setSearch}
      className={className}
    />
  );
}
