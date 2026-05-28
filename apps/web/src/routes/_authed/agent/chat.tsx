import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { ChatScreen } from '@/modules/agent/chat-screen';
import { markThreadFresh } from '@/modules/agent/lib/fresh-thread-store';

const SearchSchema = z.object({ thread: z.string().optional() });

export const Route = createFileRoute('/_authed/agent/chat')({
  validateSearch: SearchSchema,
  // Mint the thread id before the runtime mounts so the URL, the AUI runtime,
  // and the Mastra row all agree from the first send. Without this the server
  // would invent the id, the client would fish it back via listThreads(), and
  // the resulting URL flip would remount the runtime mid-stream — taking the
  // title-poll effect with it.
  beforeLoad: ({ search }) => {
    if (!search.thread) {
      const id = crypto.randomUUID();
      markThreadFresh(id);
      throw redirect({ to: '/agent/chat', search: { thread: id }, replace: true });
    }
  },
  component: ChatRoute,
});

function ChatRoute() {
  const { thread } = Route.useSearch();
  return <ChatScreen threadId={thread} />;
}
