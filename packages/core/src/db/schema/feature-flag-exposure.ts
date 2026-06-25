import { boolean, index, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { core } from './_core-schema.ts';

export const coreFeatureFlagExposure = core.table(
  'feature_flag_exposure',
  {
    flag_key: text('flag_key').notNull(),
    tenant_id: uuid('tenant_id').notNull(),
    user_id: uuid('user_id').notNull(),
    result: boolean('result').notNull(),
    last_evaluated_at: timestamp('last_evaluated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.flag_key, t.user_id] }),
    index('feature_flag_exposure_by_flag').on(t.tenant_id, t.flag_key),
  ],
);
