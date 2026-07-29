import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAgentQuality } from './boards/agent-quality';
import { buildAppService } from './boards/app-service';
import { buildFleet } from './boards/fleet';
import { buildHost } from './boards/host';
import { buildLlmGpu } from './boards/llm-gpu';
import { buildLogs } from './boards/logs';
import { buildLogsCenter } from './boards/logs-center';
import { buildPostgres } from './boards/postgres';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'dashboards');

// Register every board here as it lands.
const boards = [
  buildFleet,
  buildAppService,
  buildHost,
  buildPostgres,
  buildLlmGpu,
  buildLogs,
  buildLogsCenter,
  buildAgentQuality,
];

for (const build of boards) {
  const dash = build().build();
  const file = join(outDir, `${dash.uid}.json`);
  writeFileSync(file, `${JSON.stringify(dash, null, 2)}\n`);
  console.log(`wrote ${file}`);
}
