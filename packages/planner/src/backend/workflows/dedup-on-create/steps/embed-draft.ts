import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { TaskDraft } from '../schemas.ts';

export interface EmbedDraftDeps {
  provider: EmbeddingProvider;
}

export function buildDraftText(draft: TaskDraft): string {
  return [draft.title, draft.description, draft.skill_tags.join(', ')]
    .filter((s) => s.length > 0)
    .join('\n\n');
}

export async function embedDraft(draft: TaskDraft, deps: EmbedDraftDeps): Promise<number[]> {
  const text = buildDraftText(draft);
  const [vec] = await deps.provider.embed([text]);
  if (!vec) throw new Error('embedDraft: provider returned no vector');
  return vec;
}
