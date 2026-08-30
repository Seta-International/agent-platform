import {
  Banner,
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
import {
  monthAxisLabel,
  monthLongLabel,
  RATING_LABELS,
  shiftMonth,
  vnMonth,
} from './morale-labels.ts';

/** How far back the month pickers reach. Three years covers every cycle anyone reviews. */
const PICKER_MONTHS = 36;

/**
 * The window the tab opens on: last month through this one.
 *
 * This month is still filling up, so on its own it reads as a number with nothing to
 * compare against. The month before it is the shortest context that makes the current
 * one mean something, and anything wider is a question the viewer can ask with the
 * pickers rather than one the tab asks on their behalf.
 */
const DEFAULT_SPAN = 2;

/**
 * Longest window the chart still reads cleanly. A full year is the ordinary question this
 * tab answers, so twelve is allowed and only what runs past it is worth a word.
 */
const MAX_COMFORTABLE_SPAN = 12;

/** Months from `from` to `to`, both ends counted — the same span the chart plots. */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Morale runs 1–5; the axis is fixed so a good month cannot be flattened by rescaling. */
const SCALE: [number, number] = [1, 5];
const TICKS = [1, 2, 3, 4, 5];

/**
 * The key to the Y axis, highest first so it reads down the axis rather than against it.
 *
 * Drawn from `RATING_LABELS`, the very list the sender picked from — a 4 on this chart
 * has to read back as the "Happy" they chose, and two vocabularies for one scale would
 * leave the viewer converting between them.
 *
 * A line below the chart rather than labels on the axis itself: the longest step is
 * "1 Very unhappy", and reserving room for it takes ~130px off the plot — a fifth of the
 * chart on a desktop and nearly half of it on a phone.
 */
const SCALE_LEGEND = [...TICKS]
  .reverse()
  .map((n) => `${n} ${RATING_LABELS[n] ?? ''}`)
  .join(' · ');

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

/**
 * What the headline number was counted over, so it cannot be read as a headcount.
 *
 * Nine responses across two months and nine across a year are different claims about the
 * same figure, and the window that decides which is scrolled away in the pickers above.
 * A single month is named outright rather than counted — "across 1 month" says strictly
 * less than "in August 2026", and the name is exactly what the reader would go looking
 * for.
 */
function summariseWindow(points: MoraleTrendPoint[]): string {
  const months = points.length;
  const first = points[0];
  if (months === 1 && first) return `in ${monthLongLabel(first.period)}`;
  return `across ${months} ${months === 1 ? 'month' : 'months'}`;
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

  // Counted off the pickers rather than off the response, so the warning appears with the
  // choice that caused it instead of one request later.
  const spanMonths = monthsBetween(fromMonth, toMonth);

  return (
    <VStack gap={3}>
      <Card padding={3}>
        <VStack gap={2}>
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
          {spanMonths > MAX_COMFORTABLE_SPAN && (
            // A warning, not a block. The window is legitimate — someone comparing two
            // years has to ask for two years — but past a year the months are packed
            // tightly enough that a dip reads as noise, and that is worth saying once.
            <Banner
              status="warning"
              title={`Showing ${spanMonths} months — a window longer than 12 months packs the chart tightly and can make month-to-month changes hard to read.`}
            />
          )}
        </VStack>
      </Card>

      {trendQuery.isLoading && (
        <HStack hAlign="center">
          <Spinner />
        </HStack>
      )}

      {trendQuery.error && <Text color="secondary">Couldn't load the morale trend.</Text>}

      {/*
        Nothing plottable means nothing to caption: the total, the scale key, the glyph
        key and the withholding rule all describe a chart that is not there. Left standing
        around the explanation they bury it, and the total in particular reads as a figure
        the page is withholding rather than one it is unable to show.
      */}
      {trend && !hasAnyAverage && (
        <Card padding={0}>
          <EmptyState
            title="Not enough responses to show this anonymously"
            description={`A group needs at least ${trend.min_responses} responses in a month before its average can be shown. Nothing in this range reaches that.`}
          />
        </Card>
      )}

      {trend && hasAnyAverage && (
        <Card padding={0}>
          <VStack gap={0}>
            {/*
              One line: the count and the window it covers are a single sentence, and
              stacking them let the eye take the number on its own. Aligned on the bottom
              edge rather than the baseline — HStack has no baseline option, and across
              these two sizes the two land within a pixel or so of each other anyway.
            */}
            <HStack gap={2} vAlign="end" padding={4} wrap="wrap">
              <Text size="lg" weight="semibold">
                {trend.total_responses}
              </Text>
              <Text size="sm" color="secondary">
                {trend.total_responses === 1 ? 'response' : 'responses'}{' '}
                {summariseWindow(trend.points)}
              </Text>
            </HStack>

            <TrendLineChart
              points={points}
              domain={SCALE}
              ticks={TICKS}
              markerFor={markerFor}
              withheldLabel="hidden"
              description={describeTrend(trend.points, trend.min_responses)}
            />

            <VStack gap={0} padding={4}>
              {/*
                The scale first: it says what the axis numbers mean, and the shape line
                below only groups those same numbers. Stating the ranges twice in two
                vocabularies ("poor" beside "Very unhappy") would leave the viewer
                translating between them, so the glyph line names ranges, not moods.
              */}
              <Text size="sm" color="secondary">
                Rating scale — {SCALE_LEGEND}
              </Text>
              <Text size="sm" color="secondary">
                △ 4–5 · ◇ 3 · ▽ 1–2 — shape, not colour.
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
export function describeTrend(points: MoraleTrendPoint[], minResponses: number): string {
  const months = points
    .map((p) =>
      p.average === null
        ? `${monthLongLabel(p.period)} hidden, ${p.responses} of ${minResponses} responses`
        : `${monthLongLabel(p.period)} ${p.average.toFixed(1)} from ${p.responses} responses`,
    )
    .join('; ');
  // Names both ends of the scale rather than saying "1 to 5": a reader who never sees
  // the legend gets the same key to the numbers that a sighted one reads off it.
  return `Average morale from 1 ${RATING_LABELS[1]} to 5 ${RATING_LABELS[5]}. ${months}.`;
}
