import { createFileRoute } from '@tanstack/react-router';
import { KnowledgePage } from '@/modules/knowledge/knowledge-page';

export const Route = createFileRoute('/_authed/agent/knowledge')({
  component: KnowledgePage,
});
