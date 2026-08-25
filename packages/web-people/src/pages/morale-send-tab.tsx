import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Grid,
  HStack,
  MultiSelector,
  Text,
  Textarea,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Angry, Frown, Meh, Smile, SmilePlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { MoraleRecipientGroup } from '../api/people-client.ts';
import { submitMorale } from '../api/people-client.ts';
import { moraleKeys } from '../state/morale-query-keys.ts';
import {
  HR_BADGE,
  HR_REASON,
  initialsOf,
  RATING_LABELS,
  TAG_EMPTY_ERROR,
  TAG_LABELS,
  TAG_ORDER,
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

function MoraleSubmitForm({ groups }: { groups: MoraleRecipientGroup[] }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState<number | null>(null);
  const [concernText, setConcernText] = useState('');
  const [byRole, setByRole] = useState<Record<string, string[]>>({});
  const [openRoles, setOpenRoles] = useState<Record<string, boolean>>({});

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

  /** Everything the sender staged, back to a blank form. */
  const resetForm = () => {
    setRating(null);
    setConcernText('');
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
        recipient_person_ids: selectedIds,
      });
    },
    onSuccess: async () => {
      toast({ body: 'Morale note submitted' });
      resetForm();
      await queryClient.invalidateQueries({ queryKey: moraleKeys.history() });
      // The note has just landed in its recipients' inbox — refresh it too, so a lead
      // who is also a member sees their own note without reloading the page.
      await queryClient.invalidateQueries({ queryKey: moraleKeys.inbox() });
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

          {ordered.map((g) => (
            <RoleGroup
              key={g.tag}
              group={g}
              isOpen={openRoles[g.tag] ?? false}
              onOpenChange={(open) => setRoleOpen(g.tag, open)}
              selected={byRole[g.tag] ?? []}
              onChange={(ids) => setByRole((prev) => ({ ...prev, [g.tag]: ids }))}
            />
          ))}
        </VStack>

        <HStack>
          <Button
            label="Submit"
            variant="primary"
            onClick={() => mutation.mutate()}
            isDisabled={!rating || hasEmptyRole || mutation.isPending}
          />
        </HStack>
      </VStack>
    </Card>
  );
}

/**
 * The Send Notes tab: unchanged from the single-purpose Morale page it grew out of.
 *
 * Everyone reaches the Morale page from the nav, but only people who hold a delivery
 * capacity have anything to submit. The rest get an explanation rather than a form they
 * cannot use — for a manager that explanation sits beside the two tabs that do serve
 * them, so the page as a whole is never a dead end.
 */
export function MoraleSendTab({
  canSubmit,
  groups,
}: {
  canSubmit: boolean;
  groups: MoraleRecipientGroup[];
}) {
  if (!canSubmit) {
    return (
      <EmptyState
        title="Morale notes are for project members and team leads"
        description="You are not currently allocated to a project, so there is no reporting line to send a note along."
      />
    );
  }
  return <MoraleSubmitForm groups={groups} />;
}
