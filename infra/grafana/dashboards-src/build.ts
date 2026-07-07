import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAppService } from './boards/app-service';
import { buildFleet } from './boards/fleet';
import { buildHost } from './boards/host';
import { buildPostgres } from './boards/postgres';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'dashboards');

// Register every board here as it lands.
const boards = [buildFleet, buildAppService, buildHost, buildPostgres];

for (const build of boards) {
  const dash = build().build();
  const file = join(outDir, `${dash.uid}.json`);
  writeFileSync(file, `${JSON.stringify(dash, null, 2)}\n`);
  console.log(`wrote ${file}`);
}
