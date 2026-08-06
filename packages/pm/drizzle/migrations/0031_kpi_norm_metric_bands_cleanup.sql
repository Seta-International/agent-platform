-- data backfill: drizzle-kit cannot model a data backfill, so this is hand-written alongside the
-- generated DROP COLUMN. Values mirror KPI_NORM_METRICS (kpi-norm-data.ts) at this revision.
--
-- Corrects the two sibling plan-ratio metrics (Effort Consumption = Actual/Planned, Busy Rate =
-- Planned/Available). Both were transcribed from the same norm shape, and both got the 75% edge
-- wrong in opposite directions:
--   Effort Consumption  red `<= 0.75` OVERLAPS yellow [0.75, 0.84]. The engine checks green ->
--                       yellow -> red, so 75% already scores amber while the band text under the
--                       metric prints "red <= 75%". No stored colour changes; this only stops the
--                       printed band from contradicting the engine.
--   Busy Rate           lost the lower amber branch entirely, so 0.75..0.84 matched NO band and
--                       came back with no colour at all, and `red > 1.2` left 1.20 uncovered too.
--
-- Band columns are in the pm.tg_kpi_norm_metric_immutable protected tuple, so each UPDATE bumps
-- version, exactly as the trigger's error message instructs.
--
-- Idempotent: the DROP COLUMN is IF EXISTS and every UPDATE matches the value it replaces, so a
-- re-run touches nothing.

ALTER TABLE "pm"."kpi_norm_metric" DROP COLUMN IF EXISTS "is_live_capable";
--> statement-breakpoint

UPDATE pm.kpi_norm_metric SET
  red_band = '{"op":"or","conditions":[{"op":"lt","value":0.75},{"op":"gte","value":1.2}]}'::jsonb,
  version = version + 1
WHERE name = 'Effort Consumption'
  AND red_band = '{"op":"or","conditions":[{"op":"lte","value":0.75},{"op":"gte","value":1.2}]}'::jsonb;
--> statement-breakpoint

UPDATE pm.kpi_norm_metric SET
  yellow_band = '{"op":"or","conditions":[{"op":"between","min":0.75,"max":0.84},{"op":"between","min":1.11,"max":1.19}]}'::jsonb,
  red_band = '{"op":"or","conditions":[{"op":"lt","value":0.75},{"op":"gte","value":1.2}]}'::jsonb,
  version = version + 1
WHERE name = 'Busy Rate'
  AND yellow_band = '{"op":"between","min":1.11,"max":1.19}'::jsonb;
--> statement-breakpoint

-- kpi_norm_baseline freezes a (project, week)'s definitions BY VALUE, and ensureBaselineDefs only
-- reconciles which metrics a still-editable week carries — it never refreshes the bands on rows
-- that already exist. Without this the current week would keep scoring against the broken copy.
-- Restricted to the one week that is still editable (current ISO week in Asia/Ho_Chi_Minh, before
-- its Friday 17:00 deadline): every earlier week is frozen on purpose and keeps the definitions it
-- was actually measured with.

UPDATE pm.kpi_norm_baseline b SET
  red_band = '{"op":"or","conditions":[{"op":"lt","value":0.75},{"op":"gte","value":1.2}]}'::jsonb,
  metric_version = m.version
FROM pm.kpi_norm_metric m,
     LATERAL (SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AS ts) v
WHERE m.id = b.metric_id
  AND b.name = 'Effort Consumption'
  AND b.red_band = '{"op":"or","conditions":[{"op":"lte","value":0.75},{"op":"gte","value":1.2}]}'::jsonb
  AND b.iso_year = EXTRACT(ISOYEAR FROM v.ts)
  AND b.iso_week = EXTRACT(WEEK FROM v.ts)
  AND v.ts < date_trunc('week', v.ts) + interval '4 days 17 hours';
--> statement-breakpoint

UPDATE pm.kpi_norm_baseline b SET
  yellow_band = '{"op":"or","conditions":[{"op":"between","min":0.75,"max":0.84},{"op":"between","min":1.11,"max":1.19}]}'::jsonb,
  red_band = '{"op":"or","conditions":[{"op":"lt","value":0.75},{"op":"gte","value":1.2}]}'::jsonb,
  metric_version = m.version
FROM pm.kpi_norm_metric m,
     LATERAL (SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AS ts) v
WHERE m.id = b.metric_id
  AND b.name = 'Busy Rate'
  AND b.yellow_band = '{"op":"between","min":1.11,"max":1.19}'::jsonb
  AND b.iso_year = EXTRACT(ISOYEAR FROM v.ts)
  AND b.iso_week = EXTRACT(WEEK FROM v.ts)
  AND v.ts < date_trunc('week', v.ts) + interval '4 days 17 hours';
