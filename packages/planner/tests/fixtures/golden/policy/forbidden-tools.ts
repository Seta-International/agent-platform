// packages/planner/tests/fixtures/golden/policy/forbidden-tools.ts
import { readFileSync } from 'node:fs';

const CONFIG_URL = new URL(
  '../../../../../../docs/agents/planner-query/eval.config.json',
  import.meta.url,
);

let cached: string[] | null = null;

/** The 18-entry global read-only forbidden list from eval.config.json. */
export function globalForbiddenTools(): string[] {
  if (cached) return cached;
  const cfg = JSON.parse(readFileSync(CONFIG_URL, 'utf8')) as { forbiddenTools?: string[] };
  cached = cfg.forbiddenTools ?? [];
  return cached;
}
