import { LogsSortOrder } from '@grafana/grafana-foundation-sdk/common';
import {
  CustomVariableBuilder,
  RowBuilder,
  TextBoxVariableBuilder,
} from '@grafana/grafana-foundation-sdk/dashboard';
import { board, logsPanel, lokiLabelVar, lokiTrend } from '../skeleton';

// LogsCenter: an operations-first log view across all envs. It keeps only lines
// that carry a real operational severity and drops everything else — the opposite
// of trying to allowlist known-good sources (which missed formats) or to denylist
// each noise pattern (which never ends). A line is kept iff we can classify it
// into a severity; anything we cannot (`other`) is dropped at query time.
//
// KEPT (has a severity):
//   - pino (any module name — `apps/server`, `identity/hibp`, `planner/embed-task`,
//     …) — JSON, NUMERIC level
//   - graphile-worker — routed through pino (so usually JSON), with a text
//     `[scope] LEVEL: …` fallback
//   - Traefik access — JSON; level is always "info", so real severity is derived
//     from the HTTP status (5xx→error, 4xx→warn, else info)
//   - Traefik runtime / any logfmt — `level=error` (cert/config failures matter)
//   - crash stack traces — the `Error:` head, the `at …` frames and the
//     `Node.js v…` footer are all tagged `error`, so "why did it crash" survives
//
// DROPPED (no severity → `other`): Mastra framework chatter (`[component] …`,
// no level in the text), app-level auth notices (`[Better Auth]: User not found`),
// the six `console.log` debug dumps and their multi-line fragments (which is how
// the `[agent.chat]` userText PII disappears — it has no level), the Node
// `--inspect` banner and DeprecationWarnings. None are operational signal.
//
// Each severity token is captured CLEANLY (just the level, never the surrounding
// text) and normalised to a WORD in SEV. An earlier version captured the whole
// `[scope] LEVEL:` and matched pino numbers as substrings — a graphile worker id
// like `worker-a0608181…` contains "60", so an INFO line leaked into the `fatal`
// filter. Clean tokens + word-only options remove every such digit collision.

// pino NUMERIC level — captured as the digits alone (not `"level":30`), mapped to
// a word in SEV.
const PNUM = '`"level":(?P<pnum>\\d+)`';
// pino / Traefik JSON STRING level — `"level":"info"` → the word alone.
const JW = '`"level":"(?P<jw>\\w+)`';
// graphile text fallback — the WORD after `] ` only, never the `[scope]` (whose id
// can contain digits that used to false-match a numeric level). This word is
// UPPER-CASE (`ERROR`), so SEV lower-cases it to unify with the pino/Traefik
// lower-case levels — otherwise `sum by (sev)` in the rate panel would split each
// severity into two lines (`ERROR` vs `error`).
const GW = '`\\] (?P<gw>INFO|ERROR|WARNING|DEBUG|NOTICE|FATAL):`';
// logfmt / Traefik runtime — `level=error`.
const LW = '`(?:^|\\s)level=(?P<lw>\\w+)`';
// crash markers → error: the error head (`Error:`, `TypeError:`, …), the stack
// frames (`    at …`) and the Node footer. Keeps a full trace for debugging.
const STK = '`(?P<stk>^\\w*Error:|^\\s+at |^Node\\.js v)`';
// Traefik access severity: a failed request is still logged at level "info" — the
// HTTP status is the only signal. 5xx→error, 4xx→warn, else info.
const DST = '`"DownstreamStatus":(?P<dstatus>\\d+)`';

// Normalised severity WORD. Priority: Traefik status → pino number (mapped) →
// graphile word → crash → logfmt word → JSON string level → `other` (dropped).
const SEV =
  '`{{ if .dstatus }}{{ if hasPrefix "5" .dstatus }}error{{ else if hasPrefix "4" .dstatus }}warn{{ else }}info{{ end }}' +
  '{{ else if .pnum }}{{ if eq .pnum "60" }}fatal{{ else if eq .pnum "50" }}error{{ else if eq .pnum "40" }}warn{{ else }}info{{ end }}' +
  '{{ else if .gw }}{{ .gw | lower }}{{ else if .stk }}error{{ else if .lw }}{{ .lw }}{{ else if .jw }}{{ .jw }}{{ else }}other{{ end }}`';

// Source dropdown by container. `container` is a real Loki stream label (Alloy
// sets it from the docker name); `.*server.*` still catches a scaled-out
// `server-2`. This only SCOPES which containers are shown — severity, not this
// dropdown, decides what is kept.
const sourceVar = new CustomVariableBuilder('source')
  .label('source')
  .values(
    'App (server+worker) : .*(server|worker).*, server : .*server.*, worker : .*worker.*, proxy (Traefik) : .*proxy.*',
  )
  .current({ text: 'App (server+worker)', value: '.*(server|worker).*', selected: true });

// Severity dropdown, exact-match, default All (= any kept line). The filter is
// `sev =~ "(?i).*($level).*"` — case-insensitive so a word value matches the
// graphile WORD (`ERROR`), the Traefik word (`error`) and the mapped pino word
// alike. Values are WORDS only (no numbers → no digit collision with ids). No
// `other`: dropped upstream. No `debug`: pino runs at its default `info` level (no
// LOG_LEVEL wiring exists to raise it), so level 20/10 is never emitted. No
// includeAll: Grafana regex-escapes an include-all variable's value, which would
// break a value like `error`; a plain single-select var is interpolated raw.
const levelVar = new CustomVariableBuilder('level')
  .label('level')
  .values('All : ., error : error, warn : warn, info : info, fatal : fatal')
  .current({ text: 'All', value: '.', selected: true });

// Free-text substring filter (LogQL |=). Empty = no filter. This is the only line
// filter, so it is the only thing Grafana highlights — exactly what we want.
const searchVar = new TextBoxVariableBuilder('search').label('search').defaultValue('');

// Shared classification pipeline: select the streams, capture every severity
// token, normalise to a `sev` label and drop the unclassifiable. Both panels
// build on this — one pipeline, one place the classification can drift.
const BASE =
  `{env=~"$env", container=~"$source"}` +
  ` | regexp ${PNUM} | regexp ${JW} | regexp ${GW} | regexp ${LW} | regexp ${STK} | regexp ${DST}` +
  ` | label_format sev=${SEV} | sev != "other"`;

// Live tail (logs panel). Honours the $level dropdown and $search box.
const LIVE = `${BASE} | sev =~ "(?i).*($level).*" |= "$search"`;

// Severity rate (timeseries). Lines/sec per classified severity, so an error or
// fatal spike is visible before you scroll the log. `rate(… [5m])` mirrors the
// sibling `Logs` board; `sum by (sev)` collapses every container into one line
// per severity (case already unified via `.gw | lower`). Respects $env/$source/
// $search but NOT $level — the breakdown itself separates the severities.
const RATE = `sum by (sev) (rate(${BASE} |= "$search" [5m]))`;

export const buildLogsCenter = () =>
  board('LogsCenter', 'logs-center')
    .withVariable(lokiLabelVar('env'))
    .withVariable(sourceVar)
    .withVariable(levelVar)
    .withVariable(searchVar)
    .withRow(new RowBuilder('Rate'))
    .withPanel(
      lokiTrend({
        title: 'Log rate by severity',
        description:
          'Lines/sec per classified severity (error/fatal/warn/info). An error or fatal spike surfaces here before you scroll the log below. Follows the env/source/search filters; it ignores the level dropdown because the breakdown already splits by severity.',
        unit: 'logs',
        expr: RATE,
        legend: '{{sev}}',
      })
        .span(24)
        .height(8),
    )
    .withRow(new RowBuilder('Live'))
    .withPanel(
      logsPanel({ title: 'Logs', expr: LIVE })
        .showTime(true)
        .wrapLogMessage(true)
        .sortOrder(LogsSortOrder.Descending)
        .span(24)
        .height(24),
    );
