import { createFileRoute } from '@tanstack/react-router';
import { KnowledgePage } from '@/modules/copilot/knowledge/knowledge-page';

export const Route = createFileRoute('/_authed/copilot/knowledge')({
  component: KnowledgePage,
});
