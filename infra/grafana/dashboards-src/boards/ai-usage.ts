import { RowBuilder } from '@grafana/grafana-foundation-sdk/dashboard';
import { board, labelVar, prom, statTile, trend } from '../skeleton';
import { type Step, stepsDesc, UNIT } from '../tokens';

// Spend tiles stay one flat colour on purpose: there is no agreed budget to colour against,
// and an invented threshold would read as a real limit the first time it turned red.
const NEUTRAL: Step[] = [{ value: null, color: 'blue' }];

// Pushed straight from developer machines, so there is no `env` label to filter on the way
// the service boards do — the picker is the developer. dev_email is emitted natively by
// Claude Code from the signed-in account, so it survives the per-repo settings that carry
// the `repo` label. It only distinguishes people if each developer has their own login.
const D = '{dev_email=~"$dev"}';

const TOKENS = `claude_code_token_usage_tokens_total${D}`;
const CACHE_READ_TOKENS =
  'claude_code_token_usage_tokens_total{dev_email=~"$dev",type="cacheRead"}';
const COST = `claude_code_cost_usage_USD_total${D}`;
const SESSIONS = `claude_code_session_count_total${D}`;
const ACTIVE = `claude_code_active_time_seconds_total${D}`;

export const buildAiUsage = () =>
  board('AI Usage', 'ai-usage')
    .withVariable(labelVar('dev', 'claude_code_session_count_total'))

    // What a budget owner needs in one glance: what it costs, what it costs per head,
    // how many people it actually reaches, and how much of the spend caching avoids.
    .withRow(new RowBuilder('Executive summary'))
    .withPanel(
      statTile({
        title: 'Spend, last 30d',
        description: 'Model cost reported by every developer machine. Metadata only.',
        expr: `sum(increase(${COST}[30d]))`,
        unit: 'currencyUSD',
        steps: NEUTRAL,
        legend: 'usd',
      }),
    )
    .withPanel(
      statTile({
        title: 'Spend per active developer, 30d',
        description:
          'Total spend divided by the people who actually ran a session. Rises when a few heavy users carry the licence, which is the number to question.',
        expr: `sum(increase(${COST}[30d])) / count(count by (dev_email) (increase(${SESSIONS}[30d]) > 0))`,
        unit: 'currencyUSD',
        steps: NEUTRAL,
        legend: 'usd/dev',
      }),
    )
    .withPanel(
      statTile({
        title: 'Active developers, last 7d',
        description: 'Distinct developers with at least one session. Adoption, not headcount.',
        expr: `count(count by (dev_email) (increase(${SESSIONS}[7d]) > 0))`,
        unit: 'none',
        steps: NEUTRAL,
        legend: 'devs',
      }),
    )
    .withPanel(
      statTile({
        title: 'Cache read share, 7d',
        description:
          'Share of tokens served from prompt cache. Cache reads bill far below fresh input, so a falling share is a cost increase before it shows up as one.',
        expr: `100 * sum(increase(${CACHE_READ_TOKENS}[7d])) / sum(increase(${TOKENS}[7d]))`,
        unit: UNIT.percent,
        // Higher is better. Provisional bands — recalibrate once a few weeks of real data exist.
        steps: stepsDesc(50, 25),
        legend: 'cached',
      }),
    )

    // Adoption is a distribution, not an average: one enthusiast and nine non-users looks
    // identical to ten moderate users in a total.
    .withRow(new RowBuilder('Adoption'))
    .withPanel(
      trend({
        title: 'Active developers per day',
        description: 'Is usage spreading across the team, or plateauing on the early adopters?',
        unit: 'none',
        targets: [
          prom(`count(count by (dev_email) (increase(${SESSIONS}[1d]) > 0))`, 'active devs'),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Sessions per developer',
        description:
          'Daily sessions split by person. A flat line near zero is someone who was given a seat and never formed the habit.',
        unit: 'none',
        targets: [prom(`sum by (dev_email) (increase(${SESSIONS}[1d]))`, '{{dev_email}}')],
      }),
    )
    .withPanel(
      trend({
        title: 'Active hours per developer',
        description:
          'Time actually spent inside sessions, not wall clock. Depth of use, where session counts only show frequency.',
        unit: 'h',
        targets: [prom(`sum by (dev_email) (increase(${ACTIVE}[1d])) / 3600`, '{{dev_email}}')],
      }),
    )

    // Where the money goes, at the two granularities a lead can act on.
    .withRow(new RowBuilder('Cost drivers'))
    .withPanel(
      trend({
        title: 'Daily spend by developer',
        description:
          'Outliers here are worth a conversation, not an alert — usage patterns differ.',
        unit: 'currencyUSD',
        targets: [prom(`sum by (dev_email) (increase(${COST}[1d]))`, '{{dev_email}}')],
      }),
    )
    .withPanel(
      trend({
        title: 'Daily spend by model',
        description:
          'Reaching for the largest model on routine work is the most common avoidable cost.',
        unit: 'currencyUSD',
        targets: [prom(`sum by (model) (increase(${COST}[1d]))`, '{{model}}')],
      }),
    )
    .withPanel(
      trend({
        title: 'Cost per session',
        description:
          'Spend divided by sessions. Trending up means work is getting heavier per task, or the model mix has shifted.',
        unit: 'currencyUSD',
        targets: [
          prom(`sum(increase(${COST}[1d])) / sum(increase(${SESSIONS}[1d]))`, 'usd/session'),
        ],
      }),
    )

    // "Who uses it well", split per person. The team-level ratios above hide exactly the
    // thing a lead wants: two developers with identical spend can be doing very different
    // work, and only the per-head ratios separate them.
    .withRow(new RowBuilder('Who uses it well'))
    .withPanel(
      trend({
        title: 'Cache read share by developer',
        description:
          'Long, resumed sessions on a stable context cache well; constantly restarting from scratch does not. The clearest signal of a developer working with the tool rather than against it.',
        unit: UNIT.percent,
        softMax: 100,
        targets: [
          prom(
            `100 * sum by (dev_email) (increase(${CACHE_READ_TOKENS}[1d])) / sum by (dev_email) (increase(${TOKENS}[1d]))`,
            '{{dev_email}}',
          ),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Cost per session by developer',
        description:
          'Read together with session count: high cost on few sessions means large one-shot asks; low cost on many sessions means tight, iterative work.',
        unit: 'currencyUSD',
        targets: [
          prom(
            `sum by (dev_email) (increase(${COST}[1d])) / sum by (dev_email) (increase(${SESSIONS}[1d]))`,
            '{{dev_email}}',
          ),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Spend per active hour by developer',
        description:
          'Normalises spend by time actually spent. Separates "expensive because they use it all day" from "expensive per minute of use".',
        unit: 'currencyUSD',
        targets: [
          prom(
            `sum by (dev_email) (increase(${COST}[1d])) / (sum by (dev_email) (increase(${ACTIVE}[1d])) / 3600)`,
            '{{dev_email}}',
          ),
        ],
      }),
    )

    // How the team works, rather than how much — the part that informs training and tooling.
    .withRow(new RowBuilder('Team-wide patterns'))
    .withPanel(
      trend({
        title: 'Tokens by type',
        description: 'input / output / cacheRead / cacheCreation — the shape behind the cost line.',
        unit: UNIT.TOKS,
        targets: [prom(`sum by (type) (increase(${TOKENS}[1d]))`, '{{type}}')],
      }),
    )
    .withPanel(
      trend({
        title: 'Sessions by surface',
        description:
          'terminal_type separates plain CLI from the IDE and Claude Desktop, showing where to invest tooling effort.',
        unit: 'none',
        targets: [prom(`sum by (terminal_type) (increase(${SESSIONS}[1d]))`, '{{terminal_type}}')],
      }),
    )
    .withPanel(
      trend({
        title: 'Sessions by reasoning effort',
        description:
          'The effort level sessions actually run at. Persistent high effort on routine work is a cost lever.',
        unit: 'none',
        targets: [prom(`sum by (effort) (increase(${SESSIONS}[1d]))`, '{{effort}}')],
      }),
    );
