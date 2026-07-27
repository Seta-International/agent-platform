// Single source of design truth: SLO thresholds, colour steps, units.
// Values copied verbatim from the spec's SLO table.

export const SLO = {
  httpErrorRatioPct: { warn: 1, crit: 5 },
  httpLatencyP95Ms: { warn: 500, crit: 1000 },
  cpuBusyPct: { warn: 80, crit: 90 },
  memUsedPct: { warn: 80, crit: 90 },
  diskFreePct: { warn: 30, crit: 5 }, // reversed: higher is better; matches DiskWillFillSoon / DiskCritical
  dbConnPct: { warn: 70, crit: 80 }, // crit matches PostgresTooManyConns (> 0.8 * max_connections)
  dbCacheHitPct: { warn: 99, crit: 95 }, // reversed
  gpuTempC: { warn: 75, crit: 85 },
  vramUsedPct: { warn: 85, crit: 95 },
  llmTtftP95S: { warn: 2, crit: 5 },
  rdsFreeStorageBytes: { warn: 5e9, crit: 2e9 }, // reversed: higher is better
  availabilityPct: 99.5,
} as const;

export type Step = { value: number | null; color: string };

// Higher value = worse (green until warn, red at crit). First step is the base (-Infinity).
export const stepsAsc = (warn: number, crit: number): Step[] => [
  { value: null, color: 'green' },
  { value: warn, color: 'yellow' },
  { value: crit, color: 'red' },
];

// Higher value = better (red until crit, green past warn). Steps sorted ascending by value.
export const stepsDesc = (warn: number, crit: number): Step[] =>
  // warn === crit is a plain two-colour gauge (up/down); emitting a yellow band at the same
  // value as green gives Grafana two steps on one boundary and it renders the wrong colour.
  warn === crit
    ? [
        { value: null, color: 'red' },
        { value: warn, color: 'green' },
      ]
    : [
        { value: null, color: 'red' },
        { value: crit, color: 'yellow' },
        { value: warn, color: 'green' },
      ];

// Grafana unit ids. TOKS: Grafana has no tok/s unit; use "none" and put "tok/s" in the title.
export const UNIT = {
  percent: 'percent',
  ms: 'ms',
  s: 's',
  reqps: 'reqps',
  ops: 'ops',
  tps: 'tps',
  bytes: 'bytes',
  celsius: 'celsius',
  watt: 'watt',
  binbps: 'binbps',
  Bps: 'Bps',
  TOKS: 'none',
} as const;
