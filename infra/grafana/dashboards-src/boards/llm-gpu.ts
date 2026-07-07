import { RowBuilder } from '@grafana/grafana-foundation-sdk/dashboard';
import { board, gaugeTile, labelVar, latencyHeatmap, prom, statTile, trend } from '../skeleton';
import { SLO, stepsAsc, UNIT } from '../tokens';

const TM = '{tenant=~"$tenant",model=~"$model"}';
const T = '{tenant=~"$tenant"}';
const vramPct = 'DCGM_FI_DEV_FB_USED / (DCGM_FI_DEV_FB_USED + DCGM_FI_DEV_FB_FREE) * 100';

export const buildLlmGpu = () =>
  board('LLM & GPU', 'llm-gpu', { refresh: '10s' })
    .withVariable(labelVar('tenant', 'agent_llm_output_tokens_total'))
    .withVariable(labelVar('model', 'agent_llm_output_tokens_total'))
    .withRow(new RowBuilder('Agent inference — now'))
    .withPanel(
      statTile({
        title: 'TTFT p95',
        description:
          'Time to first token, p95 over the selected range. SLO < 2s. agent_llm_* is sparse (only while inference runs).',
        expr: `histogram_quantile(0.95, sum by (le)(increase(agent_llm_ttft_seconds_bucket${TM}[$__range])))`,
        unit: UNIT.s,
        steps: stepsAsc(SLO.llmTtftP95S.warn, SLO.llmTtftP95S.crit),
      }),
    )
    .withPanel(
      statTile({
        title: 'Avg decode tok/s',
        description:
          'Mean per-request output rate over the selected range. agent_llm_* is sparse (only while inference runs).',
        expr: `sum(increase(agent_llm_output_tokens_per_second_sum${T}[$__range])) / sum(increase(agent_llm_output_tokens_per_second_count${T}[$__range]))`,
        unit: UNIT.TOKS,
        steps: [{ value: null, color: 'green' }],
      }),
    )
    .withPanel(
      statTile({
        title: 'Requests/sec',
        description: 'Inference request rate.',
        expr: `sum(rate(agent_llm_ttft_seconds_count${TM}[5m]))`,
        unit: UNIT.reqps,
        steps: [{ value: null, color: 'green' }],
      }),
    )
    .withRow(new RowBuilder('Agent inference — trends'))
    .withPanel(
      trend({
        title: 'TTFT p50/p95/p99 by model',
        description: 'SLO line at 2s (p95).',
        unit: UNIT.s,
        softMax: SLO.llmTtftP95S.warn,
        targets: [
          prom(
            `histogram_quantile(0.50, sum by (le,model)(rate(agent_llm_ttft_seconds_bucket${TM}[5m])))`,
            'p50 {{model}}',
          ),
          prom(
            `histogram_quantile(0.95, sum by (le,model)(rate(agent_llm_ttft_seconds_bucket${TM}[5m])))`,
            'p95 {{model}}',
          ),
          prom(
            `histogram_quantile(0.99, sum by (le,model)(rate(agent_llm_ttft_seconds_bucket${TM}[5m])))`,
            'p99 {{model}}',
          ),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Decode tok/s p50/p95 by model',
        description: 'Per-request output token rate.',
        unit: UNIT.TOKS,
        targets: [
          prom(
            `histogram_quantile(0.50, sum by (le,model)(rate(agent_llm_output_tokens_per_second_bucket${TM}[5m])))`,
            'p50 {{model}}',
          ),
          prom(
            `histogram_quantile(0.95, sum by (le,model)(rate(agent_llm_output_tokens_per_second_bucket${TM}[5m])))`,
            'p95 {{model}}',
          ),
        ],
      }),
    )
    .withPanel(
      trend({
        title: 'Token throughput by tenant',
        description: 'Output + prompt tokens/sec.',
        unit: UNIT.TOKS,
        targets: [
          prom(`sum by (tenant)(rate(agent_llm_output_tokens_total${T}[5m]))`, 'out {{tenant}}'),
          prom(`sum by (tenant)(rate(agent_llm_prompt_tokens_total${T}[5m]))`, 'prompt {{tenant}}'),
        ],
      }),
    )
    .withPanel(
      latencyHeatmap({
        title: 'TTFT distribution',
        description: 'Time-to-first-token histogram over time.',
        expr: `sum by (le)(rate(agent_llm_ttft_seconds_bucket${TM}[$__rate_interval]))`,
      }),
    )
    .withRow(new RowBuilder('GPU (inference host)'))
    .withPanel(
      gaugeTile({
        title: 'GPU utilization',
        description: 'DCGM GPU util.',
        expr: 'avg(DCGM_FI_DEV_GPU_UTIL)',
        unit: UNIT.percent,
        steps: [{ value: null, color: 'green' }],
      }),
    )
    .withPanel(
      gaugeTile({
        title: 'VRAM used',
        description: 'Framebuffer used %. Amber > 85%, red > 95%.',
        expr: `avg(${vramPct})`,
        unit: UNIT.percent,
        steps: stepsAsc(SLO.vramUsedPct.warn, SLO.vramUsedPct.crit),
      }),
    )
    .withPanel(
      gaugeTile({
        title: 'GPU temperature',
        description: 'Amber > 75°C, red > 85°C.',
        expr: 'max(DCGM_FI_DEV_GPU_TEMP)',
        unit: UNIT.celsius,
        steps: stepsAsc(SLO.gpuTempC.warn, SLO.gpuTempC.crit),
        max: 100,
      }),
    )
    .withPanel(
      trend({
        title: 'GPU utilization %',
        description: 'Per GPU.',
        unit: UNIT.percent,
        targets: [prom('DCGM_FI_DEV_GPU_UTIL', 'gpu {{gpu}}')],
      }),
    )
    .withPanel(
      trend({
        title: 'GPU power draw',
        description: 'Watts per GPU.',
        unit: UNIT.watt,
        targets: [prom('DCGM_FI_DEV_POWER_USAGE', 'gpu {{gpu}}')],
      }),
    );
