import {
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Grid,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  MultiSelector,
  Selector,
  Spinner,
  Text,
  Textarea,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Angry, Frown, History, Meh, Smile, SmilePlus } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { moraleRecipientsOptions } from '../api/morale-query.ts';
import type {
  MoraleProjectOption,
  MoraleRecipientGroup,
  MoraleRecipientsResponse,
} from '../api/people-client.ts';
import { submitMorale } from '../api/people-client.ts';
import { moraleKeys } from '../state/morale-query-keys.ts';
import {
  HR_BADGE,
  HR_REASON,
  initialsOf,
  PROJECT_PLACEHOLDER,
  PROJECT_REQUIRED_HINT,
  RATING_LABELS,
  TAG_EMPTY_ERROR,
  TAG_LABELS,
  TAG_ORDER,
  UNNAMED_PROJECT,
} from './morale-labels.ts';

/**
 * Line a role's explanation up with the role name rather than the card edge — the note
 * belongs to the label, not to the row. Astryx gives Checkbox a 24px control and an 8px
 * gap, which is what these two steps of the spacing scale add up to.
 */
const CHECKBOX_LABEL_INDENT = {
  paddingInlineStart: 'calc(var(--spacing-6) + var(--spacing-2))',
} as const;

const RATING_SCALE = [
  { value: 1, icon: Angry },
  { value: 2, icon: Frown },
  { value: 3, icon: Meh },
  { value: 4, icon: Smile },
  { value: 5, icon: SmilePlus },
] as const;

// ---- Chrome -------------------------------------------------------------

export function MoraleFrame({
  children,
  action,
  current,
  trail,
}: {
  children: ReactNode;
  action?: ReactNode;
  current: string;
  trail?: ReactNode;
}) {
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/people">People</BreadcrumbItem>
                {trail}
                <BreadcrumbItem isCurrent>{current}</BreadcrumbItem>
              </Breadcrumbs>
              <Text as="h1" size="lg" weight="semibold">
                {current}
              </Text>
            </VStack>
            {action}
          </HStack>
        </LayoutHeader>
      }
      content={<LayoutContent padding={4}>{children}</LayoutContent>}
    />
  );
}

// ---- Form pieces --------------------------------------------------------

function RatingPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    // Fixed 5 equal-width columns rather than a wrapping HStack: the row's items
    // vary a lot in caption width ("Happy" vs "Very unhappy"), and a flex row
    // centers each icon within its own item's width, so the icons themselves
    // would drift out of even spacing. Equal grid tracks keep the icons evenly
    // spaced regardless of caption length.
    //
    // width="fit-content": a grid div otherwise stretches to its parent's full
    // width, which — with only 5 tracks — stretches each column far past what
    // its content needs and blows the gap out visually. Shrinking the grid to
    // its content lets `gap` size the spacing again instead of leftover track
    // space.
    <Grid columns={5} gap={2} justify="center" width="fit-content">
      {RATING_SCALE.map(({ value: n, icon: Icon }) => {
        const isSelected = value === n;
        // RATING_SCALE's values are exactly RATING_LABELS' keys (1-5), but the
        // latter is typed as Record<number, string> to also serve history rows
        // keyed by an API-sourced rating — hence the fallback here.
        const label = RATING_LABELS[n] ?? '';
        return (
          <VStack key={n} gap={1} hAlign="center">
            {/* children shows the number beside the icon; label stays the full
                word ("Very unhappy" etc.) as the accessible name, since Button
                renders children in its place but keeps label for aria-label. */}
            <Button
              variant={isSelected ? 'primary' : 'secondary'}
              onClick={() => onChange(n)}
              label={label}
              icon={<Icon size={18} />}
            >
              {n}
            </Button>
            <Text size="sm" color={isSelected ? 'primary' : 'secondary'}>
              {label}
            </Text>
          </VStack>
        );
      })}
    </Grid>
  );
}

/**
 * One role, one checkbox. Ticking it reveals the people picker for that role — the
 * checkbox is the only expand control on purpose, so there is never a state where a
 * role is ticked but its (hidden) selection is a mystery.
 *
 * Fully controlled: the open flag lives with the selection in the parent, because a
 * local `useState` seeded from props would keep its value when the form resets after a
 * submit, leaving a ticked checkbox above an empty picker.
 */
function RoleGroup({
  group,
  isOpen,
  onOpenChange,
  selected,
  onChange,
}: {
  group: MoraleRecipientGroup;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string[];
  onChange: (personIds: string[]) => void;
}) {
  const unavailable = group.candidates.length === 0;
  const label = TAG_LABELS[group.tag];

  const contextByPerson = useMemo(
    () => new Map(group.candidates.map((c) => [c.person_id, c.context])),
    [group.candidates],
  );

  const options = useMemo(
    () =>
      group.candidates.map((c) => ({
        value: c.person_id,
        label: c.full_name ?? 'Unknown',
      })),
    [group.candidates],
  );

  return (
    <Card
      padding={3}
      variant={unavailable ? 'muted' : 'default'}
      // Dashed border for a role nobody can be picked from: the row still has to be
      // readable (it explains why), but it must not look like something to click. The
      // `muted` variant draws no border of its own, so the width and colour come with it.
      style={
        unavailable
          ? {
              borderWidth: '1px',
              borderStyle: 'dashed',
              borderColor: 'var(--color-border-emphasized)',
            }
          : undefined
      }
    >
      <VStack gap={isOpen ? 3 : 0}>
        <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
          <Checkbox
            label={label}
            value={isOpen}
            isDisabled={unavailable}
            onChange={(next) => onOpenChange(!!next)}
          />
          <Badge
            variant={unavailable ? 'red' : 'green'}
            label={
              unavailable
                ? 'Unavailable'
                : `${group.candidates.length} ${group.candidates.length === 1 ? 'person' : 'people'} available`
            }
          />
        </HStack>

        {unavailable && (
          <Text size="sm" color="secondary" style={CHECKBOX_LABEL_INDENT}>
            {group.unavailable_reason}
          </Text>
        )}

        {isOpen && !unavailable && (
          <VStack gap={1}>
            <MultiSelector
              label={`${label} recipients`}
              isLabelHidden
              placeholder="Select recipients..."
              options={options}
              value={selected}
              onChange={onChange}
              status={
                selected.length === 0
                  ? { type: 'error', message: TAG_EMPTY_ERROR[group.tag] }
                  : undefined
              }
              hasSearch
              searchPlaceholder="Search by name..."
              triggerDisplay="badges"
              width="100%"
              renderOption={(o) => {
                const context = contextByPerson.get(o.value);
                return (
                  <HStack gap={2} vAlign="center">
                    <Text size="sm" weight="semibold">
                      {initialsOf(o.label ?? null)}
                    </Text>
                    <VStack gap={0}>
                      <Text size="sm">{o.label}</Text>
                      <Text size="sm" color="secondary">
                        {context ? `${label} · ${context}` : label}
                      </Text>
                    </VStack>
                  </HStack>
                );
              }}
            />
            {selected.length > 0 && (
              // Suppressed while the error is up: two lines of small print under one
              // field buries the thing the sender has to act on.
              <Text size="sm" color="secondary">
                Only people who are still employed and still hold this role are listed.
              </Text>
            )}
          </VStack>
        )}
      </VStack>
    </Card>
  );
}

/**
 * Which project the note is filed against — the first thing on the form, because every
 * recipient below it is read from that choice.
 *
 * Only rendered as a control when there is a decision to make. One project is stated
 * rather than asked: the sender still sees what will be stored against their note, but a
 * dropdown holding a single option is a question with one answer. No project at all
 * renders nothing — an HR or BoD manager files a note that belongs to no project, and an
 * empty picker would imply they were missing something.
 */
function ProjectScope({
  projects,
  value,
  onChange,
}: {
  projects: MoraleProjectOption[];
  value: string | null;
  onChange: (projectId: string) => void;
}) {
  if (projects.length === 0) return null;

  if (projects.length === 1) {
    const only = projects[0];
    return (
      <VStack gap={1}>
        <Text size="sm" weight="semibold">
          Project
        </Text>
        <Text size="sm" color="secondary">
          This note is filed against {only?.name ?? UNNAMED_PROJECT}.
        </Text>
      </VStack>
    );
  }

  return (
    <Selector
      label="Project"
      isRequired
      options={projects.map((p) => ({ value: p.project_id, label: p.name ?? UNNAMED_PROJECT }))}
      // undefined rather than null: the non-clearable Selector treats null as a cleared
      // value, and this field is required once there is more than one project.
      value={value ?? undefined}
      onChange={onChange}
      placeholder={PROJECT_PLACEHOLDER}
      hasSearch
      searchPlaceholder="Search projects..."
      width="100%"
    />
  );
}

function MoraleSubmitForm({ bootstrap }: { bootstrap: MoraleRecipientsResponse }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  /**
   * Null means "let the server decide": with one project it resolves to that project,
   * with none it stays null, and only a sender holding several has to fill this in. That
   * keeps the common cases on a single cache entry instead of refetching an answer the
   * first response already contained.
   */
  const [projectId, setProjectId] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [concernText, setConcernText] = useState('');
  const [byRole, setByRole] = useState<Record<string, string[]>>({});
  const [openRoles, setOpenRoles] = useState<Record<string, boolean>>({});

  // Recipients are re-fetched per project; `bootstrap` is this query's own cached first
  // page while `projectId` is null, so the initial render costs no extra request.
  const recipients = useQuery(moraleRecipientsOptions(projectId));
  const projects = recipients.data?.projects ?? bootstrap.projects;
  const groups = recipients.data?.groups ?? [];

  /** Several projects and none chosen: TL and AM cannot be resolved, so Submit waits. */
  const needsProject = projects.length > 1 && !recipients.data?.selected_project_id;

  const selectedIds = useMemo(() => [...new Set(Object.values(byRole).flat())], [byRole]);

  /**
   * Roles the sender ticked but left empty.
   *
   * Ticking a role is a statement of intent to send to someone in it, so submitting with
   * an empty picker would silently drop that intent — the note would go out without the
   * recipient the sender meant to add, and nothing on screen would say so.
   */
  const hasEmptyRole = useMemo(
    () => Object.entries(openRoles).some(([tag, open]) => open && (byRole[tag]?.length ?? 0) === 0),
    [openRoles, byRole],
  );

  /**
   * Everything the sender staged, back to a blank form. The project deliberately
   * survives: it is the context the note was written in rather than part of its content,
   * and someone filing a second note is almost always still on the same project.
   */
  const resetForm = () => {
    setRating(null);
    setConcernText('');
    setByRole({});
    setOpenRoles({});
  };

  /**
   * Switching project invalidates every pick below it: the Team Leader and Account
   * Manager belong to the old project, and PMO/BoD selections are cleared with them
   * rather than surviving alone, so what is ticked always matches the list on screen.
   */
  const onProjectChange = (next: string) => {
    setProjectId(next);
    setByRole({});
    setOpenRoles({});
  };

  const setRoleOpen = (tag: string, open: boolean) => {
    setOpenRoles((prev) => ({ ...prev, [tag]: open }));
    // Unticking clears that role's picks: leaving them staged but invisible would send
    // recipients the sender believes they removed.
    if (!open) setByRole((prev) => ({ ...prev, [tag]: [] }));
  };

  const mutation = useMutation({
    mutationFn: () => {
      if (!rating) throw new Error('Rating is required');
      return submitMorale({
        rating,
        concern_text: concernText || undefined,
        // The sender's own pick, not the resolved one: with a single project or none,
        // null is correct and the server fills in the only possible answer.
        project_id: projectId,
        recipient_person_ids: selectedIds,
      });
    },
    onSuccess: async () => {
      toast({ body: 'Morale note submitted' });
      resetForm();
      await queryClient.invalidateQueries({ queryKey: moraleKeys.history() });
    },
    // Nothing is cleared here: a failed submit keeps every field so the sender can
    // retry without retyping their concern.
    onError: async (err: Error) => {
      toast({ body: err.message, type: 'error' });
      await queryClient.invalidateQueries({ queryKey: moraleKeys.recipients() });
    },
  });

  const ordered = TAG_ORDER.map((tag) => groups.find((g) => g.tag === tag)).filter(
    (g): g is MoraleRecipientGroup => !!g,
  );

  return (
    <Card padding={4}>
      <VStack gap={4}>
        <Text size="lg" weight="semibold">
          How are you feeling?
        </Text>

        <ProjectScope projects={projects} value={projectId} onChange={onProjectChange} />

        <VStack gap={2}>
          <Text size="sm" weight="semibold">
            Morale rating
          </Text>
          <RatingPicker value={rating} onChange={setRating} />
        </VStack>

        <VStack gap={1}>
          {/*
            Visible heading rather than the field's own label, matching the rating group
            above. Field's `isOptional` marker is the theme's required-red, which reads as
            a warning on a field that is merely optional; the accessible name still comes
            from the (hidden) label on the control itself.
          */}
          <Text size="sm" weight="semibold">
            Concern note{' '}
            <Text as="span" size="sm" weight="normal" color="secondary">
              (optional)
            </Text>
          </Text>
          <Textarea
            label="Concern note (optional)"
            isLabelHidden
            value={concernText}
            onChange={(val) => setConcernText(val)}
            rows={4}
          />
        </VStack>

        <VStack gap={2}>
          <Text size="sm" weight="semibold">
            Recipients
          </Text>

          <Card padding={3} variant="muted">
            <VStack gap={0}>
              <HStack vAlign="center" gap={2} wrap="wrap">
                <Checkbox label={TAG_LABELS.hr} value isDisabled onChange={() => {}} />
                <Badge variant="yellow" label={HR_BADGE} />
              </HStack>
              <Text size="sm" color="secondary" style={CHECKBOX_LABEL_INDENT}>
                {HR_REASON}
              </Text>
            </VStack>
          </Card>

          {recipients.isPending ? (
            // Only the recipient list reloads on a project switch — the rating and the
            // concern the sender already typed stay on screen and keep their state.
            <HStack hAlign="center">
              <Spinner />
            </HStack>
          ) : (
            ordered.map((g) => (
              <RoleGroup
                key={g.tag}
                group={g}
                isOpen={openRoles[g.tag] ?? false}
                onOpenChange={(open) => setRoleOpen(g.tag, open)}
                selected={byRole[g.tag] ?? []}
                onChange={(ids) => setByRole((prev) => ({ ...prev, [g.tag]: ids }))}
              />
            ))
          )}

          {needsProject && !recipients.isPending && (
            <Text size="sm" color="secondary">
              {PROJECT_REQUIRED_HINT}
            </Text>
          )}
        </VStack>

        <HStack>
          <Button
            label="Submit"
            variant="primary"
            onClick={() => mutation.mutate()}
            isDisabled={
              !rating ||
              hasEmptyRole ||
              // Submitting now would be refused server-side for want of a project, so the
              // block is stated here where PROJECT_REQUIRED_HINT can explain it.
              needsProject ||
              recipients.isPending ||
              mutation.isPending
            }
          />
        </HStack>
      </VStack>
    </Card>
  );
}

// ---- Page ---------------------------------------------------------------

export function MoralePage() {
  const recipientsQuery = useQuery(moraleRecipientsOptions());

  const historyButton = (
    <Link to="/people/morale/history">
      <Button label="View history" variant="secondary" icon={<History size={16} />} />
    </Link>
  );

  if (recipientsQuery.isLoading) {
    return (
      <MoraleFrame current="Morale">
        <HStack hAlign="center">
          <Spinner />
        </HStack>
      </MoraleFrame>
    );
  }

  if (recipientsQuery.error) {
    return (
      <MoraleFrame current="Morale" action={historyButton}>
        <Banner status="error" title="Couldn't load the morale form. Please try again." />
      </MoraleFrame>
    );
  }

  // Holding no allocation is no longer a bar: an HR or BoD manager is a member of the
  // company even when they sit on no project, and their note reaches PMO and BoD with no
  // project attached. What remains is the one case with nothing to resolve at all — a
  // login with no employee record behind it, which is an admin problem rather than a
  // form the sender could complete.
  //
  // No History action here either: history is the record of what this page submits, so
  // someone who may not submit has nothing to read and the button would only lead to a
  // guaranteed empty list.
  if (!recipientsQuery.data?.can_submit) {
    return (
      <MoraleFrame current="Morale">
        <EmptyState
          title="No employee record is linked to your account"
          description="A morale note is filed against your employee record, and this login has none. Ask HR or an administrator to link them, then reopen this page."
        />
      </MoraleFrame>
    );
  }

  return (
    <MoraleFrame current="Morale" action={historyButton}>
      <MoraleSubmitForm bootstrap={recipientsQuery.data} />
    </MoraleFrame>
  );
}
