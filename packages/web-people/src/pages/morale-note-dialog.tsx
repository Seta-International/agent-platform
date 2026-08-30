import {
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  Divider,
  HStack,
  Layout,
  LayoutContent,
  Text,
  VStack,
} from '@seta/shared-ui';
import type { MoraleInboxNote } from '../api/people-client.ts';
import { formatNoteTimestamp, RATING_ONLY_TEXT, SENDER_CAPACITY_LABELS } from './morale-labels.ts';
import { MoraleRecipientTokens } from './morale-recipient-tokens.tsx';

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

                {/*
                  Rules above and below the text, so who wrote it and who else holds it
                  read as framing rather than as more of the note. Without them the tags
                  sit directly under the sender's last sentence and look like part of it.
                */}
                <Divider />

                {note.concern_text ? (
                  // pre-wrap: the sender's paragraph breaks are part of what they wrote.
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{note.concern_text}</Text>
                ) : (
                  <Text color="secondary" style={{ fontStyle: 'italic' }}>
                    {RATING_ONLY_TEXT}
                  </Text>
                )}

                <Divider />

                {/*
                  Uncaptioned: "Also received by" was true of the other roles and false of
                  the viewer's own, and the viewer's own is exactly what these tags now
                  single out. The tags name themselves.
                */}
                <MoraleRecipientTokens note={note} />
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <DialogFooter>
            {/*
              A second way out beside the header's ✕. The ✕ is small, unlabelled and at
              the far corner from where reading ends; after a long note the pointer is at
              the bottom of the dialog already.
            */}
            <Button variant="secondary" label="Close" onClick={onClose} />
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
