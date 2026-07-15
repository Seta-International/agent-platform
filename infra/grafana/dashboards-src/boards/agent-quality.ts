import { RowBuilder } from '@grafana/grafana-foundation-sdk/dashboard';
import { board, envVar, prom, statTile, trend } from '../skeleton';
import { stepsAsc, UNIT } from '../tokens';

const E = '{env=~"$env"}';

export const buildAgentQuality = () =>
  board('Agent Quality', 'agent-quality')
    .withVariable(envVar('agent_eval_score'))
    .withRow(new RowBuilder('Freshness'))
    .withPanel(
      statTile({
        title: 'Last eval run age',
        description:
          'Time since the last completed nightly agent-quality run. Warns at 36h (AgentEvalStale).',
        expr: `time() - max(agent_eval_last_run_timestamp_seconds${E})`,
        unit: UNIT.s,
        steps: stepsAsc(129600, 172800), // 36h warn, 48h crit
        legend: 'age',
      }),
    )
    .withRow(new RowBuilder('Judge scores (advisory, 0–1)'))
    .withPanel(
      trend({
        title: 'Score by specialist × scorer',
        description:
          'Advisory nightly judge scores; a daily step line (the gauge changes once per nightly run).',
        unit: 'none',
        softMax: 1,
        targets: [prom(`agent_eval_score${E}`, '{{specialist_id}} · {{scorer_id}}')],
      }),
    );
