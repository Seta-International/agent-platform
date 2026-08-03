import {
  Banner,
  Button,
  Dialog,
  DialogFooter,
  DialogHeader,
  Layout,
  LayoutContent,
  RadioGroup,
  RadioListItem,
  Selector,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useState } from 'react';
import type {
  DirectoryConflictRow,
  DirectoryResolutionAction,
  OrgUnitOption,
} from '../api/directory-sync-client.ts';
import { ACTION_LABEL, conflictCandidates, conflictSubject } from './conflict-copy.ts';

export interface ConflictActionDialogProps {
  conflict: DirectoryConflictRow;
  /** One of the three actions that cannot be posted without a choice. */
  action: Extract<DirectoryResolutionAction, 'choose_head' | 'link' | 'reassign'>;
  orgUnits: OrgUnitOption[];
  /** Why the org tree is unavailable, when it is — `reassign` has nothing to offer without it. */
  orgUnitsError: Error | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (params: Record<string, unknown>) => void;
}

const PROMPT: Record<ConflictActionDialogProps['action'], string> = {
  choose_head: 'Who leads this unit?',
  link: 'Which person is this Entra user?',
  reassign: 'Where should these people go?',
};

const EXPLANATION: Record<ConflictActionDialogProps['action'], string> = {
  choose_head:
    'Only the people Entra reports as managers of this unit can be pinned — anyone else would be replaced again on the next run.',
  link: 'They keep their existing record, and from the next run on Microsoft 365 owns their name, title and photo.',
  reassign:
    'Everyone in the unit moves to the one you pick, and the empty unit is then deleted. If the department was only renamed in Entra, close this and let the next run clear it instead.',
};

/**
 * The param picker for `choose_head`, `link` and `reassign`. Every other action posts straight
 * from the row, because it needs nothing the conflict does not already carry.
 *
 * For `choose_head` and `link` the options are the conflict's own candidates and nothing else: the
 * resolver rejects any other `person_id`, so offering a free search would build a picker whose
 * choices mostly 400.
 */
export function ConflictActionDialog({
  conflict,
  action,
  orgUnits,
  orgUnitsError,
  isPending,
  onCancel,
  onConfirm,
}: ConflictActionDialogProps) {
  const [choice, setChoice] = useState('');
  const candidates = conflictCandidates(conflict);
  const targets = orgUnits.filter((u) => u.id !== conflict.subject_id);

  const confirm = () => {
    if (!choice) return;
    onConfirm(action === 'reassign' ? { target_org_unit_id: choice } : { person_id: choice });
  };

  return (
    <Dialog isOpen onOpenChange={(next) => !next && onCancel()} purpose="form" width={480}>
      <Layout
        header={
          <DialogHeader
            title={PROMPT[action]}
            subtitle={conflictSubject(conflict)}
            onOpenChange={(next) => !next && onCancel()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} style={{ paddingTop: 'var(--spacing-1)' }}>
              <Text type="supporting" color="secondary" display="block">
                {EXPLANATION[action]}
              </Text>

              {action === 'reassign' ? (
                orgUnitsError ? (
                  <Banner
                    status="error"
                    title={`Could not load the org chart: ${orgUnitsError.message}`}
                  />
                ) : (
                  <Selector
                    label="Move everyone to"
                    placeholder="Pick a unit"
                    hasSearch
                    options={targets.map((u) => ({ value: u.id, label: u.name }))}
                    value={choice}
                    onChange={(next) => setChoice(next)}
                  />
                )
              ) : candidates.length === 0 ? (
                <Banner
                  status="warning"
                  title="This conflict lists no candidates, so there is nothing to pick. Ignore it instead."
                />
              ) : (
                <RadioGroup
                  label={PROMPT[action]}
                  isLabelHidden
                  value={choice}
                  onChange={(next) => setChoice(next)}
                >
                  {candidates.map((c) => (
                    <RadioListItem
                      key={c.person_id}
                      value={c.person_id}
                      label={c.full_name ?? c.person_id}
                      description={
                        c.report_count !== null
                          ? `${c.report_count} direct report${c.report_count === 1 ? '' : 's'}`
                          : (c.work_email ?? undefined)
                      }
                    />
                  ))}
                </RadioGroup>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <DialogFooter>
            <Button variant="secondary" label="Cancel" onClick={onCancel} />
            {/* Astryx's Button is secondary by default — without this the confirm reads as a
                second Cancel. */}
            <Button
              variant="primary"
              label={isPending ? 'Applying…' : ACTION_LABEL[action]}
              onClick={confirm}
              isDisabled={!choice || isPending}
            />
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
