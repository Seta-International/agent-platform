// Assert every generated panel's Prometheus target returns >=1 series.
// Usage: tsx scripts/smoke.ts http://localhost:9090   (Loki targets are skipped)
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const prom = process.argv[2];
if (!prom) throw new Error('usage: tsx scripts/smoke.ts <prometheus-url>');

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dashboards');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

// Minimal shapes for the parsed dashboard JSON we actually read.
interface RawTarget {
  expr?: string;
  datasource?: { uid?: string };
}
interface RawPanel {
  type?: string;
  title?: string;
  panels?: RawPanel[];
  targets?: RawTarget[];
}
interface PromQueryResponse {
  data?: { result?: unknown[] };
}

// $var placeholders → permissive matcher so the query still resolves.
const expand = (e: string) =>
  e
    .replace(/\$env/g, '.*')
    .replace(/\$tenant/g, '.*')
    .replace(/\$model/g, '.*')
    .replace(/\$container/g, '.*')
    .replace(/\$__rate_interval/g, '5m');

let failures = 0;
for (const f of files) {
  const dash = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { panels?: RawPanel[] };
  const panels = [...(dash.panels ?? [])].flatMap((p: RawPanel) =>
    p.type === 'row' ? (p.panels ?? []) : [p],
  );
  for (const p of panels) {
    for (const t of p.targets ?? []) {
      if (!t.expr || t.datasource?.uid !== 'prometheus') continue;
      const url = `${prom}/api/v1/query?query=${encodeURIComponent(expand(t.expr))}`;
      const r = (await fetch(url).then((x) => x.json())) as PromQueryResponse;
      const n = r?.data?.result?.length ?? 0;
      if (n === 0) {
        failures++;
        console.error(`EMPTY  ${f} :: ${p.title} :: ${t.expr}`);
      }
    }
  }
}
console.log(failures === 0 ? 'smoke OK' : `smoke FAILED: ${failures} empty targets`);
process.exit(failures === 0 ? 0 : 1);
