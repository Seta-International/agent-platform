import { Badge, Banner, EmptyState, HStack, SettingsSection, Text, VStack } from '@seta/shared-ui';
import { CheckCircle2 } from 'lucide-react';
import type {
  DirectoryConflictKind,
  DirectoryConflictRow,
  OrgUnitOption,
} from '../api/directory-sync-client.ts';
import { ConflictRow } from './ConflictRow.tsx';
import { CONFLICT_KIND_LABEL, CONFLICT_KIND_NOTE, CONFLICT_KIND_ORDER } from './conflict-copy.ts';

export interface ConflictQueueProps {
  conflicts: DirectoryConflictRow[] | undefined;
  isLoading: boolean;
  error: Error | null;
  /** True while a run is working, so the empty state can say "checked", not "checking". */
  isRunInFlight: boolean;
  nameFor: (personId: string) => string | null;
  orgUnits: OrgUnitOption[];
  orgUnitsError: Error | null;
}

function groupByKind(
  rows: DirectoryConflictRow[],
): Array<[DirectoryConflictKind, DirectoryConflictRow[]]> {
  const groups = new Map<DirectoryConflictKind, DirectoryConflictRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.kind);
    if (bucket) bucket.push(row);
    else groups.set(row.kind, [row]);
  }
  // Fixed order, so the queue does not reshuffle itself as rows are resolved.
  return CONFLICT_KIND_ORDER.filter((kind) => groups.has(kind)).map((kind) => [
    kind,
    groups.get(kind) ?? [],
  ]);
}

/**
 * Design §9.3's conflict queue: open rows only, grouped by kind.
 *
 * The empty state is the normal case, not an edge case — a healthy tenant has nothing here — so it
 * says the sync ran and found nothing to ask about, rather than looking like a page that failed to
 * load.
 */
export function ConflictQueue({
  conflicts,
  isLoading,
  error,
  isRunInFlight,
  nameFor,
  orgUnits,
  orgUnitsError,
}: ConflictQueueProps) {
  if (error) {
    return <Banner status="error" title={`Could not load the conflict queue: ${error.message}`} />;
  }
  if (isLoading || !conflicts) {
    return (
      <Text color="secondary" display="block">
        Loading conflicts…
      </Text>
    );
  }

  if (conflicts.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="size-6" aria-hidden />}
        title="Nothing needs you"
        description={
          isRunInFlight
            ? 'A run is in progress. Anything it cannot decide on its own will show up here.'
            : 'The last sync matched everyone in Microsoft 365 to a person here without having to guess. Conflicts only appear when Entra is ambiguous or disagrees with something curated.'
        }
      />
    );
  }

  return (
    <VStack gap={8}>
      {groupByKind(conflicts).map(([kind, rows]) => (
        <SettingsSection
          key={kind}
          title={CONFLICT_KIND_LABEL[kind]}
          description={CONFLICT_KIND_NOTE[kind]}
        >
          <HStack paddingBlock={2}>
            <Badge label={`${rows.length} open`} />
          </HStack>
          {rows.map((conflict) => (
            <ConflictRow
              key={conflict.id}
              conflict={conflict}
              nameFor={nameFor}
              orgUnits={orgUnits}
              orgUnitsError={orgUnitsError}
            />
          ))}
        </SettingsSection>
      ))}
    </VStack>
  );
}
