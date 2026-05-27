import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ChatScreen } from '@/modules/agent/chat-screen';

export const Route = createFileRoute('/_authed/agent/chat')({
  validateSearch: z.object({ thread: z.string().optional() }),
  component: function ChatRoute() {
    const search = Route.useSearch();
    return <ChatScreen threadId={search.thread} />;
  },
});
