import { FileText } from 'lucide-react';
import type { PageContext } from './agent-provider';
import { ContextChip } from './context-chip';

/** Page context the user sent the turn with (e.g. the plan/task they were on). */
export function RenderContextBadge({ data }: { data: PageContext }) {
  return <ContextChip kind={data.kind} label={data.label} icon={<FileText aria-hidden />} />;
}
