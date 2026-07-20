// scripts/dev/seed-golden-dataset.ts
//
// Seeds the golden dataset eval fixture (tenant, people, groups, plans,
// tasks, comments, events) into the local dev Postgres so it's available
// for manual QA and query-agent eval runs.
//
// Usage:
//   pnpm seed:golden
//   DATABASE_URL=postgresql://... pnpm seed:golden

import pg from 'pg';
import {
  cleanGoldenDataset,
  seedGoldenDataset,
  TENANT_ID,
} from '../../packages/planner/tests/fixtures/golden/index.ts';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://seta:seta@localhost:5542/seta';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    console.log('Cleaning existing golden dataset...');
    await cleanGoldenDataset(pool);
    console.log('Seeding golden dataset...');
    await seedGoldenDataset(pool);
    console.log('Done. Seeded:');

    const counts = await Promise.all([
      pool.query(`SELECT count(*)::int AS c FROM people.person WHERE tenant_id = $1`, [TENANT_ID]),
      pool.query(`SELECT count(*)::int AS c FROM planner.groups WHERE tenant_id = $1`, [TENANT_ID]),
      pool.query(`SELECT count(*)::int AS c FROM planner.tasks WHERE tenant_id = $1`, [TENANT_ID]),
      pool.query(`SELECT count(*)::int AS c FROM core.events WHERE tenant_id = $1`, [TENANT_ID]),
      pool.query(`SELECT count(*)::int AS c FROM planner.task_comments WHERE tenant_id = $1`, [
        TENANT_ID,
      ]),
    ]);
    console.log(`  People: ${counts[0].rows[0]?.c}`);
    console.log(`  Groups: ${counts[1].rows[0]?.c}`);
    console.log(`  Tasks:  ${counts[2].rows[0]?.c}`);
    console.log(`  Events: ${counts[3].rows[0]?.c}`);
    console.log(`  Comments: ${counts[4].rows[0]?.c}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
