import { HStack, Text, VStack } from '@seta/shared-ui';
import type { CSSProperties, ReactNode } from 'react';
import type { GroupAxis } from '../lib/performance-scores.ts';
import { HeatCell, pillarColor } from './performance-score-bits.tsx';

export type HeatColumn = {
  id: string;
  title: string;
  /** Second header line, e.g. "4 ppl · Pham Quoc Bao ▸". */
  subtitle?: ReactNode;
  /** group_id → score. A group with nothing submitted is absent, and renders as "—". */
  scores: Record<string, number>;
  overall: number | null;
};

/**
 * Pillar × column score matrix (groups down the side, one or more columns
 * across the top, Overall as the final row). A native grid — each row is its own
 * grid sharing one column template so tracks align while every row keeps its own
 * border — because the matrix needs rich two-line headers, per-pillar bullet
 * marks, and a selectable, tinted column, none of which the Table primitive
 * expresses. When `onSelect` is omitted the headers are static (single-column
 * views like the Team Lead's own project).
 */
export function PillarHeatmap({
  groups,
  columns,
  selectedId,
  onSelect,
}: {
  groups: readonly GroupAxis[];
  columns: readonly HeatColumn[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
}) {
  const gridCols: CSSProperties = {
    gridTemplateColumns: `minmax(200px, 2.2fr) repeat(${columns.length}, minmax(148px, 1fr))`,
  };
  const tint = (id: string): CSSProperties | undefined =>
    selectedId === id ? { background: 'var(--color-accent-muted)' } : undefined;

  return (
    <div>
      {/* Header row */}
      <div
        className="grid items-end gap-x-2 border-b px-2 pb-3"
        style={{ ...gridCols, borderColor: 'var(--color-border)' }}
      >
        <Text size="2xs" color="secondary" className="uppercase tracking-wide">
          Pillar / weight
        </Text>
        {columns.map((col) => {
          const isSelected = selectedId === col.id;
          const inner = (
            <>
              <Text
                size="sm"
                weight="semibold"
                className="truncate"
                color={isSelected ? 'accent' : 'primary'}
              >
                {col.title}
              </Text>
              {col.subtitle != null ? (
                <Text size="2xs" color="secondary" className="truncate">
                  {col.subtitle}
                </Text>
              ) : null}
            </>
          );
          return onSelect ? (
            <button
              key={col.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(col.id)}
              className="flex cursor-pointer flex-col items-center gap-0.5 rounded-t-lg px-2 py-2 text-center"
              style={tint(col.id)}
            >
              {inner}
            </button>
          ) : (
            <div
              key={col.id}
              className="flex flex-col items-center gap-0.5 rounded-t-lg px-2 py-2 text-center"
              style={tint(col.id)}
            >
              {inner}
            </div>
          );
        })}
      </div>

      {/* Pillar rows */}
      {groups.map((g, i) => (
        <div
          key={g.group_id}
          className="grid items-center gap-x-2 border-b px-2 py-2"
          style={{ ...gridCols, borderColor: 'var(--color-border-subtle, var(--color-border))' }}
        >
          <HStack gap={2} vAlign="center">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: pillarColor(i) }}
            />
            <VStack gap={0}>
              <Text size="sm" weight="semibold" className="leading-tight">
                {g.name}
              </Text>
              <Text size="2xs" color="secondary">
                weight {g.weight}%
              </Text>
            </VStack>
          </HStack>
          {columns.map((col) => (
            <div key={col.id} className="px-1" style={tint(col.id)}>
              <HeatCell value={col.scores[g.group_id] ?? null} />
            </div>
          ))}
        </div>
      ))}

      {/* Overall row */}
      <div className="grid items-center gap-x-2 px-2 py-2" style={gridCols}>
        <HStack gap={1.5} vAlign="center">
          <Text size="sm" weight="semibold">
            Overall
          </Text>
          <Text size="2xs" color="secondary">
            weighted
          </Text>
        </HStack>
        {columns.map((col) => (
          <div key={col.id} className="px-1" style={tint(col.id)}>
            <HeatCell value={col.overall} />
          </div>
        ))}
      </div>
    </div>
  );
}
