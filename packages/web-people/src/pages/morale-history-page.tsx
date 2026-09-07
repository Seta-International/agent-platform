import {
  BreadcrumbItem,
  Button,
  Card,
  DateInput,
  EmptyState,
  HStack,
  Pagination,
  paginateData,
  Spinner,
  shouldShowPagination,
  Text,
  Token,
  VStack,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { moraleHistoryOptions } from '../api/morale-query.ts';
import type { MoraleNoteView } from '../api/people-client.ts';
import { RATING_LABELS, TAG_LABELS, UNNAMED_PROJECT } from './morale-labels.ts';
import { MoraleFrame } from './morale-page.tsx';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 10;

/** How many recipients a note shows before it needs "See more". */
const RECIPIENT_PREVIEW = 5;

/** 'YYYY-MM-DD' for an instant as seen in Asia/Ho_Chi_Minh, matching the server's window. */
function vnDay(at: Date): string {
  // en-CA is the locale that formats as YYYY-MM-DD, which is what the API expects.
  return at.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/**
 * The window the page opens on: the last month up to today.
 *
 * A default of "all time" would make the first paint the most expensive one and bury
 * recent notes; a month is the span someone actually reviews, and widening it is one click.
 */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  return { from: vnDay(monthAgo), to: vnDay(now) };
}

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

function NoteCard({ note }: { note: MoraleNoteView }) {
  const [showAllRecipients, setShowAllRecipients] = useState(false);

  const hiddenCount = note.recipients.length - RECIPIENT_PREVIEW;
  const isCollapsible = hiddenCount > 0;
  const shownRecipients =
    isCollapsible && !showAllRecipients
      ? note.recipients.slice(0, RECIPIENT_PREVIEW)
      : note.recipients;

  return (
    <Card padding={4}>
      <VStack gap={2}>
        <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
          <HStack vAlign="center" gap={2} wrap="wrap">
            <Text size="sm" color="secondary">
              {formatSubmittedAt(note.submitted_at)}
            </Text>
            {/*
              Keyed off project_id, not the name: a note filed against no project (an HR
              or BoD sender) shows nothing here, while one whose project has left the
              projection still says so rather than silently reading as project-less.
            */}
            {note.project_id && (
              // Not Text's `color="accent"`: theme-neutral is greyscale, so its accent
              // resolves to #262626 — indistinguishable from body text, which is the one
              // thing this label must not be. `--color-text-blue` is a real theme token
              // and carries its own dark-mode half via light-dark().
              <Text size="sm" weight="semibold" style={{ color: 'var(--color-text-blue)' }}>
                {note.project_name ?? UNNAMED_PROJECT}
              </Text>
            )}
          </HStack>
          <Text size="sm">
            Your rating: {note.rating} — {RATING_LABELS[note.rating]}
          </Text>
        </HStack>

        {note.concern_text ? (
          <Text>{note.concern_text}</Text>
        ) : (
          <Text color="secondary" style={{ fontStyle: 'italic' }}>
            (No concern note)
          </Text>
        )}

        <HStack gap={1} wrap="wrap" vAlign="center">
          {shownRecipients.map((r) => (
            <Token
              // Recipients are deduped per note, so tag + name identifies one uniquely;
              // HR collapses to a single nameless entry, hence the bare tag fallback.
              key={`${r.recipient_tag}-${r.full_name_snapshot ?? ''}`}
              size="sm"
              label={
                r.recipient_tag === 'hr'
                  ? `${TAG_LABELS.hr} (required)`
                  : `${r.full_name_snapshot ?? 'Unknown'} · ${TAG_LABELS[r.recipient_tag]}`
              }
            />
          ))}
          {isCollapsible && !showAllRecipients && (
            // The count sits next to the chips rather than inside the button: it is the
            // fact ("2 more people got this"), and the button is the action on it.
            <Text size="sm" color="secondary">
              +{hiddenCount}
            </Text>
          )}
          {isCollapsible && (
            <Button
              size="sm"
              variant="ghost"
              label={showAllRecipients ? 'See less' : 'See more'}
              onClick={() => setShowAllRecipients((v) => !v)}
            />
          )}
        </HStack>
      </VStack>
    </Card>
  );
}

export function MoraleHistoryPage() {
  const [{ from, to }, setRange] = useState(defaultRange);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Empty string is how a cleared DateInput reads; normalise it away so a cleared end and
  // an untouched one share the same query key rather than caching the same request twice.
  const historyQuery = useQuery(
    moraleHistoryOptions({ from: from || undefined, to: to || undefined }),
  );
  const notes = useMemo(() => historyQuery.data?.notes ?? [], [historyQuery.data]);

  // A new window is a new result set, so the old page number no longer means anything —
  // same reset the resourcing table does when its rows change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: notes is the intentional reset trigger
  useEffect(() => {
    setPage(1);
  }, [notes]);

  const pageNotes = useMemo(
    () => paginateData(notes, page, pageSize) as MoraleNoteView[],
    [notes, page, pageSize],
  );

  // Back lands on the send tab: history is the record of what that tab submits, and the
  // route's `tab` search param is required, so the destination has to be named.
  const backButton = (
    <Link to="/people/morale" search={{ tab: 'send' }}>
      <Button label="Back to Morale" variant="secondary" icon={<ArrowLeft size={16} />} />
    </Link>
  );

  return (
    <MoraleFrame
      current="History"
      trail={<BreadcrumbItem href="/people/morale?tab=send">Morale</BreadcrumbItem>}
      action={backButton}
    >
      <VStack gap={3}>
        <HStack gap={3} vAlign="end" wrap="wrap">
          {/*
            `max`/`min` cross-bind the two fields so the calendars themselves rule out an
            inverted window — cheaper for the sender than picking a bad pair and reading an
            error afterwards. Clearing either end leaves that side open.
          */}
          <DateInput
            label="From"
            size="sm"
            value={from}
            max={to || undefined}
            onChange={(v) => setRange((prev) => ({ ...prev, from: v ?? '' }))}
          />
          <DateInput
            label="To"
            size="sm"
            value={to}
            min={from || undefined}
            onChange={(v) => setRange((prev) => ({ ...prev, to: v ?? '' }))}
          />
          {!historyQuery.isLoading && (
            <Text size="sm" color="secondary">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </Text>
          )}
        </HStack>

        {historyQuery.isLoading && (
          <HStack hAlign="center">
            <Spinner />
          </HStack>
        )}

        {historyQuery.error && <Text color="secondary">Couldn't load your morale history.</Text>}

        {!historyQuery.isLoading && !historyQuery.error && notes.length === 0 && (
          <EmptyState
            title="No morale notes in this range"
            description={
              from || to
                ? 'Try widening the date range, or clear it to see every note you have sent.'
                : 'Notes you submit will appear here, newest first.'
            }
          />
        )}

        {pageNotes.map((n) => (
          <NoteCard key={n.id} note={n} />
        ))}

        {shouldShowPagination({
          totalItems: notes.length,
          pageSize,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
        }) && (
          <Pagination
            page={page}
            onChange={setPage}
            totalItems={notes.length}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={(ps) => {
              setPageSize(ps);
              setPage(1);
            }}
          />
        )}
      </VStack>
    </MoraleFrame>
  );
}
