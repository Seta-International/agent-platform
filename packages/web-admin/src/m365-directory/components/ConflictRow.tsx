import { Banner, Button, HStack, InfoRow, Text, Timestamp, VStack } from '@seta/shared-ui';
import { useState } from 'react';
import type {
  DirectoryConflictRow as ConflictRowData,
  DirectoryResolutionAction,
  OrgUnitOption,
} from '../api/directory-sync-client.ts';
import { useResolveDirectoryConflict } from '../hooks/use-directory-sync.ts';
import { ConflictActionDialog } from './ConflictActionDialog.tsx';
import {
  ACTION_LABEL,
  ACTIONS_NEEDING_INPUT,
  conflictSubject,
  conflictSummary,
} from './conflict-copy.ts';

export interface ConflictRowProps {
  conflict: ConflictRowData;
  /** Names a person id where the org chart is readable; ids are the fallback, never a blank. */
  nameFor: (personId: string) => string | null;
  orgUnits: OrgUnitOption[];
  orgUnitsError: Error | null;
}

type PickerAction = Extract<DirectoryResolutionAction, 'choose_head' | 'link' | 'reassign'>;

function needsInput(action: DirectoryResolutionAction): action is PickerAction {
  return (ACTIONS_NEEDING_INPUT as DirectoryResolutionAction[]).includes(action);
}

/**
 * One queued conflict.
 *
 * The buttons come from `conflict.actions` — the list the API serves from the same `ACTIONS_BY_KIND`
 * the resolver validates against. There is deliberately no local table of "which actions does this
 * kind offer": design §9.1's table has already drifted from the code once (it still lists
 * `create_new` for `email_collision`, which the resolver rejects), and a copy here would render a
 * button that 400s on click.
 */
export function ConflictRow({ conflict, nameFor, orgUnits, orgUnitsError }: ConflictRowProps) {
  const [picking, setPicking] = useState<PickerAction | null>(null);
  const resolve = useResolveDirectoryConflict();

  const submit = (action: DirectoryResolutionAction, params?: Record<string, unknown>) => {
    resolve.mutate(
      { conflictId: conflict.id, action, ...(params ? { params } : {}) },
      { onSuccess: () => setPicking(null) },
    );
  };

  // A 200 with `resolved: false` is a refusal the admin can act on (a delete still blocked by a
  // child unit, or another admin having got there first) — not a transport error.
  const refusal = resolve.data && !resolve.data.resolved ? resolve.data.reason : null;

  return (
    <>
      <InfoRow
        label={conflictSubject(conflict, nameFor)}
        value={
          <VStack gap={0}>
            <Text type="supporting" color="secondary" display="block">
              {conflictSummary(conflict)}
            </Text>
            <Text type="supporting" color="disabled" display="block">
              {/* hasTooltip={false}: the default lazily imports an extensionless Tooltip path
                  that Node's ESM resolver cannot load. */}
              Last seen <Timestamp value={conflict.last_seen_at} format="auto" hasTooltip={false} />
            </Text>
            {/* Astryx's `TextColor` has no error/warning member — status colour on text comes from
                Banner, not from a Text prop. */}
            {refusal && (
              <Banner status="warning" title={`Not applied: ${refusal.replace(/_/g, ' ')}`} />
            )}
            {resolve.error && <Banner status="error" title={(resolve.error as Error).message} />}
          </VStack>
        }
        action={
          <HStack gap={2} vAlign="center">
            {conflict.actions.map((action, index) => (
              <Button
                key={action}
                size="sm"
                // The offered action leads; `ignore` recedes so dismissing never looks like the
                // recommended move.
                variant={action === 'ignore' ? 'ghost' : index === 0 ? 'primary' : 'secondary'}
                label={ACTION_LABEL[action] ?? action}
                isDisabled={resolve.isPending}
                onClick={() => (needsInput(action) ? setPicking(action) : submit(action))}
              />
            ))}
          </HStack>
        }
      />
      {picking && (
        <ConflictActionDialog
          conflict={conflict}
          action={picking}
          orgUnits={orgUnits}
          orgUnitsError={orgUnitsError}
          isPending={resolve.isPending}
          onCancel={() => setPicking(null)}
          onConfirm={(params) => submit(picking, params)}
        />
      )}
    </>
  );
}
