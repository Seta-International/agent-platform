import {
  Badge,
  Button,
  Card,
  Checkbox,
  Collapsible,
  DateInput,
  EmptyState,
  HStack,
  List,
  ListItem,
  Selector,
  Spinner,
  StatusDot,
  Text,
  Token,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { moraleInboxFiltersOptions, moraleInboxOptions } from '../api/morale-query.ts';
import type {
  MoraleInboxNote,
  MoraleInboxProjectGroup,
  MoraleInboxResponse,
} from '../api/people-client.ts';
import { markMoraleNoteRead, NO_PROJECT_FILTER } from '../api/people-client.ts';
import { moraleKeys } from '../state/morale-query-keys.ts';
import {
  formatNoteTimestamp,
  noteCountLabel,
  previewOf,
  RATING_ONLY_TEXT,
  SENDER_CAPACITY_LABELS,
  TAG_LABELS,
  vnDay,
} from './morale-labels.ts';
import { MoraleNoteDialog } from './morale-note-dialog.tsx';

/** Sentinels for "no filter", so the pickers never have to carry an empty value. */
const ALL_PROJECTS = 'all';
const ANY_SENDER = 'anyone';

/** How many projects, and how many notes inside one, are shown before "Show more". */
const PROJECT_PAGE = 5;
const NOTE_PAGE = 5;

/**
 * The window the inbox opens on: the last month up to today.
 *
 * Everything ever received would make the first paint the most expensive one and bury
 * this week under last quarter. A month is the span someone actually reviews, and
 * widening it is one click.
 */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  return { from: vnDay(monthAgo), to: vnDay(now) };
}

/** Null project ids travel as a sentinel, since a select value cannot be null. */
function projectKey(projectId: string | null): string {
  return projectId ?? NO_PROJECT_FILTER;
}

function NoteRow({ note, onOpen }: { note: MoraleInboxNote; onOpen: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { shown, isTruncated } = previewOf(note.concern_text ?? '');

  return (
    <ListItem
      onClick={onOpen}
      startContent={
        note.is_read ? undefined : <StatusDot variant="accent" label="Unread" tooltip="Unread" />
      }
      label={
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text weight={note.is_read ? 'normal' : 'semibold'}>{note.sender_name ?? 'Unknown'}</Text>
          {note.sender_capacity && (
            <Text size="sm" color="secondary">
              {SENDER_CAPACITY_LABELS[note.sender_capacity]}
            </Text>
          )}
        </HStack>
      }
      description={
        <VStack gap={2}>
          {note.concern_text ? (
            <Text size="sm" color={note.is_read ? 'secondary' : 'primary'}>
              {isTruncated && !isExpanded ? `${shown}… ` : note.concern_text}
              {isTruncated && !isExpanded && (
                // Expands in place rather than opening the note: reading more is not the
                // same act as opening it, and opening is what marks it read.
                <Button
                  variant="ghost"
                  size="sm"
                  label="+ more"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(true);
                  }}
                />
              )}
            </Text>
          ) : (
            <Text size="sm" color="secondary" style={{ fontStyle: 'italic' }}>
              {RATING_ONLY_TEXT}
            </Text>
          )}
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
      }
      endContent={
        <Text size="sm" color="secondary">
          {formatNoteTimestamp(note.submitted_at)}
        </Text>
      }
    />
  );
}

function ProjectGroup({
  group,
  isOpen,
  onOpenChange,
  onOpenNote,
}: {
  group: MoraleInboxProjectGroup;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenNote: (note: MoraleInboxNote) => void;
}) {
  const [showAllNotes, setShowAllNotes] = useState(false);
  const shown = showAllNotes ? group.notes : group.notes.slice(0, NOTE_PAGE);
  const remaining = group.notes.length - shown.length;

  return (
    <Card padding={0}>
      <Collapsible
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        trigger={
          <HStack gap={2} vAlign="center" wrap="wrap" width="100%">
            <Text weight="semibold">{group.project_name}</Text>
            <Text size="sm" color="secondary">
              {noteCountLabel(group.total_notes)}
            </Text>
            {group.unread_notes > 0 && (
              <Badge variant="info" label={`${group.unread_notes} unread`} />
            )}
          </HStack>
        }
      >
        <List hasDividers>
          {shown.map((note) => (
            <NoteRow key={note.id} note={note} onOpen={() => onOpenNote(note)} />
          ))}
        </List>
        {(remaining > 0 || showAllNotes) && (
          <HStack padding={3}>
            {remaining > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                label={`Show ${remaining} more`}
                onClick={() => setShowAllNotes(true)}
              />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                label="Show less"
                onClick={() => setShowAllNotes(false)}
              />
            )}
          </HStack>
        )}
      </Collapsible>
    </Card>
  );
}

/**
 * The Notes Received tab: everything addressed to this person, grouped by the project its
 * sender wrote from (FUT-786).
 *
 * No rating appears anywhere on this surface, by contract rather than by omission — the
 * API does not return one. A submission with no text still shows up, because the person
 * did respond and dropping them would misstate how many people spoke.
 */
export function MoraleInboxTab() {
  const queryClient = useQueryClient();
  const today = vnDay(new Date());

  const [range, setRange] = useState(defaultRange);
  const [project, setProject] = useState(ALL_PROJECTS);
  const [sender, setSender] = useState(ANY_SENDER);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [visibleProjects, setVisibleProjects] = useState(PROJECT_PAGE);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [openNote, setOpenNote] = useState<MoraleInboxNote | null>(null);

  const dateWindow = { from: range.from || undefined, to: range.to || undefined };
  const optionsQuery = useQuery(moraleInboxFiltersOptions(dateWindow));
  const inboxQuery = useQuery(
    moraleInboxOptions({
      ...dateWindow,
      project_id: project === ALL_PROJECTS ? undefined : project,
      sender_person_id: sender === ANY_SENDER ? undefined : sender,
      unread_only: unreadOnly || undefined,
    }),
  );

  const senders = useMemo(() => optionsQuery.data?.senders ?? [], [optionsQuery.data]);
  const projects = useMemo(() => optionsQuery.data?.projects ?? [], [optionsQuery.data]);
  const selectedSender = senders.find((s) => s.person_id === sender);

  /**
   * The two pickers narrow each other (FUT-786 AC): once a sender is chosen, the only
   * projects on offer are "all" and the one they write from — any other choice would
   * describe a combination that has no notes in it.
   */
  const projectOptions = useMemo(() => {
    const all = { value: ALL_PROJECTS, label: 'All projects' };
    const source = selectedSender
      ? projects.filter((p) => projectKey(p.project_id) === projectKey(selectedSender.project_id))
      : projects;
    return [all, ...source.map((p) => ({ value: projectKey(p.project_id), label: p.name }))];
  }, [projects, selectedSender]);

  const senderOptions = useMemo(() => {
    const anyone = { value: ANY_SENDER, label: 'Anyone' };
    const source =
      project === ALL_PROJECTS
        ? senders
        : senders.filter((s) => projectKey(s.project_id) === project);
    return [
      anyone,
      ...source.map((s) => ({ value: s.person_id, label: s.full_name ?? 'Unknown' })),
    ];
  }, [senders, project]);

  /** A new window is a new result set, so paging and group state start over with it. */
  const setWindow = (next: { from: string; to: string }) => {
    setRange(next);
    setVisibleProjects(PROJECT_PAGE);
    setCollapsed(new Set());
  };

  const chooseSender = (next: string) => {
    setSender(next);
    setVisibleProjects(PROJECT_PAGE);
    // Clearing a project the new sender never wrote from, rather than leaving a pair of
    // filters on screen that between them select nothing.
    const chosen = senders.find((s) => s.person_id === next);
    if (chosen && project !== ALL_PROJECTS && projectKey(chosen.project_id) !== project) {
      setProject(ALL_PROJECTS);
    }
  };

  const chooseProject = (next: string) => {
    setProject(next);
    setVisibleProjects(PROJECT_PAGE);
    if (next !== ALL_PROJECTS && selectedSender && projectKey(selectedSender.project_id) !== next) {
      setSender(ANY_SENDER);
    }
  };

  /**
   * Reading a note is a side effect of opening it, so the badge has to move before the
   * server answers — and move back if it never does. Every cached inbox window is patched,
   * not just the visible one, because the same note appears in several of them.
   */
  const markRead = useMutation({
    mutationFn: (noteId: string) => markMoraleNoteRead(noteId),
    onMutate: async (noteId: string) => {
      await queryClient.cancelQueries({ queryKey: moraleKeys.inbox() });
      const snapshot = queryClient.getQueriesData<MoraleInboxResponse>({
        queryKey: moraleKeys.inbox(),
      });
      queryClient.setQueriesData<MoraleInboxResponse>(
        { queryKey: moraleKeys.inbox() },
        (current) => (current ? markNoteRead(current, noteId) : current),
      );
      return { snapshot };
    },
    onError: (_err, _noteId, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: moraleKeys.inbox() }),
  });

  const onOpenNote = (note: MoraleInboxNote) => {
    setOpenNote(note);
    if (!note.is_read) markRead.mutate(note.id);
  };

  const groups = inboxQuery.data?.projects ?? [];
  const shownGroups = groups.slice(0, visibleProjects);
  const remainingProjects = groups.length - shownGroups.length;

  const filters = (
    <Card padding={3}>
      <HStack gap={3} vAlign="end" wrap="wrap">
        {/*
          `max`/`min` cross-bind the two fields so the calendars themselves rule out an
          inverted window, and neither end can reach past today — cheaper for the reader
          than picking a bad pair and being told afterwards.
        */}
        <DateInput
          label="From"
          size="sm"
          value={range.from}
          max={range.to || today}
          onChange={(v) => setWindow({ ...range, from: v ?? '' })}
        />
        <DateInput
          label="To"
          size="sm"
          value={range.to}
          min={range.from || undefined}
          max={today}
          onChange={(v) => setWindow({ ...range, to: v ?? '' })}
        />
        <Selector
          label="Project"
          size="sm"
          options={projectOptions}
          value={project}
          onChange={chooseProject}
          width={220}
        />
        <Selector
          label="Sender"
          size="sm"
          options={senderOptions}
          value={sender}
          onChange={chooseSender}
          hasSearch
          searchPlaceholder="Search by name..."
          width={220}
        />
        <Checkbox label="Unread only" value={unreadOnly} onChange={(v) => setUnreadOnly(!!v)} />
        {inboxQuery.data && (
          <Text size="sm" color="secondary">
            {noteCountLabel(inboxQuery.data.total_notes)}
          </Text>
        )}
      </HStack>
    </Card>
  );

  return (
    <VStack gap={3}>
      {filters}

      {inboxQuery.isLoading && (
        <HStack hAlign="center">
          <Spinner />
        </HStack>
      )}

      {inboxQuery.error && <Text color="secondary">Couldn't load the notes addressed to you.</Text>}

      {!inboxQuery.isLoading && !inboxQuery.error && groups.length === 0 && (
        <EmptyState
          title="No morale notes yet"
          description="When someone chooses you as a recipient, their note appears here — newest first, grouped by the project they wrote from."
        />
      )}

      {groups.length > 0 && (
        <>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text size="sm" color="secondary">
              Grouped by project
            </Text>
            <Button
              variant="ghost"
              size="sm"
              label="Expand all"
              onClick={() => setCollapsed(new Set())}
            />
            <Button
              variant="ghost"
              size="sm"
              label="Collapse all"
              onClick={() => setCollapsed(new Set(groups.map((g) => projectKey(g.project_id))))}
            />
          </HStack>

          {shownGroups.map((group) => {
            const key = projectKey(group.project_id);
            return (
              <ProjectGroup
                key={key}
                group={group}
                isOpen={!collapsed.has(key)}
                onOpenChange={(open) =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (open) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                onOpenNote={onOpenNote}
              />
            );
          })}

          <HStack gap={2}>
            {remainingProjects > 0 && (
              <Button
                variant="secondary"
                size="sm"
                label={`Show ${Math.min(remainingProjects, PROJECT_PAGE)} more`}
                onClick={() => setVisibleProjects((n) => n + PROJECT_PAGE)}
              />
            )}
            {visibleProjects > PROJECT_PAGE && (
              <Button
                variant="ghost"
                size="sm"
                label="Show less"
                onClick={() => setVisibleProjects(PROJECT_PAGE)}
              />
            )}
          </HStack>
        </>
      )}

      <MoraleNoteDialog note={openNote} onClose={() => setOpenNote(null)} />
    </VStack>
  );
}

/** Flips one note to read across a cached inbox response, counts included. */
function markNoteRead(inbox: MoraleInboxResponse, noteId: string): MoraleInboxResponse {
  let changed = false;
  const projects = inbox.projects.map((group) => {
    if (!group.notes.some((n) => n.id === noteId && !n.is_read)) return group;
    changed = true;
    return {
      ...group,
      unread_notes: Math.max(0, group.unread_notes - 1),
      notes: group.notes.map((n) => (n.id === noteId ? { ...n, is_read: true } : n)),
    };
  });
  if (!changed) return inbox;
  return { ...inbox, unread_notes: Math.max(0, inbox.unread_notes - 1), projects };
}
