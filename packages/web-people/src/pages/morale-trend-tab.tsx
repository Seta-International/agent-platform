import {
  Card,
  EmptyState,
  HStack,
  Selector,
  Spinner,
  Text,
  TrendLineChart,
  type TrendLinePoint,
  type TrendMarker,
  VStack,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { moraleTrendOptions } from '../api/morale-query.ts';
import type { MoraleTrendPoint } from '../api/people-client.ts';
import { monthAxisLabel, monthLongLabel, shiftMonth, vnMonth } from './morale-labels.ts';

/** How far back the month pickers reach. Three years covers every cycle anyone reviews. */
const PICKER_MONTHS = 36;

/** The window the tab opens on. */
const DEFAULT_SPAN = 12;

/** Morale runs 1–5; the axis is fixed so a good month cannot be flattened by rescaling. */
const SCALE: [number, number] = [1, 5];
const TICKS = [1, 2, 3, 4, 5];

/**
 * Shape, not colour, carries the reading: ▽ poor, ◇ average, △ good.
 *
 * A viewer who cannot separate the hues still gets the trend, and the glyph survives a
 * printed or screenshotted chart where the accent colour does not.
 */
function markerFor(average: number): TrendMarker {
  const rounded = Math.round(average);
  if (rounded <= 2) return 'down';
  if (rounded === 3) return 'diamond';
  return 'up';
}

/** Every month from `PICKER_MONTHS` ago up to now — never a future one. */
function monthOptions(currentMonth: string): { value: string; label: string }[] {
  const months: { value: string; label: string }[] = [];
  for (let i = PICKER_MONTHS - 1; i >= 0; i--) {
    const month = shiftMonth(currentMonth, -i);
    months.push({ value: month, label: monthLongLabel(month) });
  }
  return months.reverse();
}

function TrendTooltip({ point, minResponses }: { point: MoraleTrendPoint; minResponses: number }) {
  if (point.average === null) {
    return (
      <VStack gap={0}>
        <Text size="sm" weight="semibold">
          Hidden
        </Text>
        <Text size="sm" color="secondary">
          {monthLongLabel(point.period)} · {point.responses} of {minResponses} responses needed
        </Text>
      </VStack>
    );
  }
  return (
    <VStack gap={0}>
      <Text size="sm" weight="semibold">
        {point.average.toFixed(1)} average morale
      </Text>
      <Text size="sm" color="secondary">
        {monthLongLabel(point.period)} · {point.responses}{' '}
        {point.responses === 1 ? 'response' : 'responses'}
      </Text>
    </VStack>
  );
}

/**
 * The Morale Trend tab: the anonymous monthly average for the group this viewer is
 * responsible for (FUT-786).
 *
 * The scope is decided server-side from the viewer's capacity and is deliberately not on
 * screen — there is no control here that could widen it, so naming it would only invite
 * the question. What is on screen is the month window and the participation behind each
 * point, because both change how much weight the line deserves.
 */
export function MoraleTrendTab() {
  const currentMonth = vnMonth(new Date());
  const [fromMonth, setFromMonth] = useState(() => shiftMonth(currentMonth, -(DEFAULT_SPAN - 1)));
  const [toMonth, setToMonth] = useState(currentMonth);

  const allMonths = useMemo(() => monthOptions(currentMonth), [currentMonth]);
  // The pickers cannot express an inverted range at all: "from" stops at the chosen end
  // month, "to" starts at the chosen beginning. Nothing to validate after the fact.
  const fromOptions = useMemo(
    () => allMonths.filter((m) => m.value <= toMonth),
    [allMonths, toMonth],
  );
  const toOptions = useMemo(
    () => allMonths.filter((m) => m.value >= fromMonth),
    [allMonths, fromMonth],
  );

  const trendQuery = useQuery(moraleTrendOptions({ from_month: fromMonth, to_month: toMonth }));
  const trend = trendQuery.data;

  const points: TrendLinePoint[] = useMemo(
    () =>
      (trend?.points ?? []).map((p) => ({
        label: monthAxisLabel(p.period),
        value: p.average,
        // Shaded only where responses exist but stay below the threshold. A month nobody
        // answered is left plain — there is nothing being withheld.
        isWithheld: p.average === null && p.responses > 0,
        tooltip: <TrendTooltip point={p} minResponses={trend?.min_responses ?? 0} />,
      })),
    [trend],
  );

  const hasAnyAverage = points.some((p) => p.value !== null);

  return (
    <VStack gap={3}>
      <Card padding={3}>
        <HStack gap={3} vAlign="end" wrap="wrap">
          <Selector
            label="From month"
            size="sm"
            options={fromOptions}
            value={fromMonth}
            onChange={setFromMonth}
            width={200}
          />
          <Selector
            label="To month"
            size="sm"
            options={toOptions}
            value={toMonth}
            onChange={setToMonth}
            width={200}
          />
        </HStack>
      </Card>

      {trendQuery.isLoading && (
        <HStack hAlign="center">
          <Spinner />
        </HStack>
      )}

      {trendQuery.error && <Text color="secondary">Couldn't load the morale trend.</Text>}

      {trend && (
        <Card padding={0}>
          <VStack gap={0}>
            <VStack gap={0} padding={4}>
              <Text size="lg" weight="semibold">
                {trend.total_responses}
              </Text>
              <Text size="sm" color="secondary">
                total {trend.total_responses === 1 ? 'response' : 'responses'}
              </Text>
            </VStack>

            {hasAnyAverage ? (
              <TrendLineChart
                points={points}
                domain={SCALE}
                ticks={TICKS}
                markerFor={markerFor}
                withheldLabel="hidden"
                description={describe(trend.points, trend.min_responses)}
              />
            ) : (
              <EmptyState
                title="Not enough responses to show this anonymously"
                description={`A group needs at least ${trend.min_responses} responses in a month before its average can be shown. Nothing in this range reaches that.`}
              />
            )}

            <VStack gap={0} padding={4}>
              <Text size="sm" color="secondary">
                ▽ 1–2 poor · ◇ 3 average · △ 4–5 good — shape, not colour.
              </Text>
              <Text size="sm" color="secondary">
                Months under {trend.min_responses} responses stay hidden; the line breaks rather
                than bridging them.
              </Text>
            </VStack>
          </VStack>
        </Card>
      )}
    </VStack>
  );
}

/** Spoken form of the whole series, for a reader who never sees the marks. */
function describe(points: MoraleTrendPoint[], minResponses: number): string {
  const months = points
    .map((p) =>
      p.average === null
        ? `${monthLongLabel(p.period)} hidden, ${p.responses} of ${minResponses} responses`
        : `${monthLongLabel(p.period)} ${p.average.toFixed(1)} from ${p.responses} responses`,
    )
    .join('; ');
  return `Average morale on a 1 to 5 scale. ${months}.`;
}
