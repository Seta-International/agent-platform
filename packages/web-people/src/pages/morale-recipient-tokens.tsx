import { HStack, Token } from '@seta/shared-ui';
import type { MoraleInboxNote, MoraleRecipientTag } from '../api/people-client.ts';
import { TAG_LABELS } from './morale-labels.ts';

/**
 * Every role a note reached, with the viewer's own marked.
 *
 * The list and the dialog render the same component so a note cannot describe its
 * recipients one way in a row and another way when opened.
 */
export function MoraleRecipientTokens({
  note,
  size = 'sm',
}: {
  note: Pick<MoraleInboxNote, 'recipient_tags' | 'my_tags'>;
  size?: 'sm' | 'md';
}) {
  const mine = new Set<MoraleRecipientTag>(note.my_tags);

  return (
    <HStack gap={1} wrap="wrap">
      {note.recipient_tags.map((tag) => (
        <Token key={tag} size={size} color={tokenColor(tag, mine)} label={tokenLabel(tag, mine)} />
      ))}
    </HStack>
  );
}

/**
 * HR first, and unconditionally: it is the one role nobody chose and nobody can remove,
 * and saying so matters more than telling an HR viewer something they already know — the
 * only reason their inbox holds this note is that they are HR. Every other role the
 * viewer holds is worth pointing out, because on those the note was addressed to them by
 * name rather than by rota.
 */
function tokenColor(
  tag: MoraleRecipientTag,
  mine: Set<MoraleRecipientTag>,
): 'yellow' | 'green' | 'default' {
  if (tag === 'hr') return 'yellow';
  return mine.has(tag) ? 'green' : 'default';
}

function tokenLabel(tag: MoraleRecipientTag, mine: Set<MoraleRecipientTag>): string {
  if (tag === 'hr') return `${TAG_LABELS.hr} · required`;
  return mine.has(tag) ? `${TAG_LABELS[tag]} · you` : TAG_LABELS[tag];
}
