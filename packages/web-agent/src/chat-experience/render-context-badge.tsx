import { Token } from '@seta/shared-ui';
import { Paperclip } from 'lucide-react';
import type { PageContext } from './agent-provider';

export function RenderContextBadge({ data }: { data: PageContext }) {
  // Astryx `Token` takes a single string label, so the old four-span row
  // (prefix / kind / em-dash / label) collapses into one, and the literal 📎
  // becomes the token's icon slot.
  return (
    <Token
      size="sm"
      icon={<Paperclip aria-hidden />}
      label={`sent with context: ${data.kind} — ${data.label}`}
    />
  );
}
