import {
  Dialog,
  DialogFooter,
  DialogHeader,
  HStack,
  Layout,
  LayoutContent,
  Text,
  Token,
  VStack,
} from '@seta/shared-ui';
import type { MoraleInboxNote } from '../api/people-client.ts';
import {
  formatNoteTimestamp,
  RATING_ONLY_TEXT,
  SENDER_CAPACITY_LABELS,
  TAG_LABELS,
} from './morale-labels.ts';

/**
 * One note in full.
 *
 * Shows nothing the list did not already carry — no rating, no recipient names — it just
 * stops truncating. Opening it is what marks the note read, so the dialog is the read
 * receipt as much as the reading surface; the caller owns that mutation because it also
 * owns the list the optimistic update lands in.
 */
export function MoraleNoteDialog({
  note,
  onClose,
}: {
  note: MoraleInboxNote | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      isOpen={note !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={620}
    >
      <Layout
        header={
          <DialogHeader
            title={note?.sender_name ?? 'Morale note'}
            onOpenChange={(open) => {
              if (!open) onClose();
            }}
          />
        }
        content={
          <LayoutContent>
            {note && (
              <VStack gap={3}>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  {note.sender_capacity && (
                    <Text size="sm" color="secondary">
                      {SENDER_CAPACITY_LABELS[note.sender_capacity]}
                    </Text>
                  )}
                  <Text size="sm" color="secondary">
                    {formatNoteTimestamp(note.submitted_at)}
                  </Text>
                </HStack>

                {note.concern_text ? (
                  // pre-wrap: the sender's paragraph breaks are part of what they wrote.
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{note.concern_text}</Text>
                ) : (
                  <Text color="secondary" style={{ fontStyle: 'italic' }}>
                    {RATING_ONLY_TEXT}
                  </Text>
                )}

                <VStack gap={1}>
                  <Text size="sm" color="secondary">
                    Also received by
                  </Text>
                  <HStack gap={1} wrap="wrap">
                    {note.recipient_tags.map((tag) => (
                      <Token
                        key={tag}
                        size="sm"
                        color={tag === 'hr' ? 'yellow' : 'default'}
                        label={tag === 'hr' ? `${TAG_LABELS.hr} · required` : TAG_LABELS[tag]}
                      />
                    ))}
                  </HStack>
                </VStack>
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <DialogFooter>
            <Text size="sm" color="secondary">
              Replying to the sender is not available yet.
            </Text>
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
