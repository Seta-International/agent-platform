-- hand-written: drizzle pgTable cannot express the structural CHECK we need on category_descriptions
CREATE OR REPLACE FUNCTION planner.fn_validate_category_descriptions(j jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_each_text(j) e(k, v)
    WHERE k !~ '^category([1-9]|1[0-9]|2[0-5])$'
       OR length(v) > 100
  )
$$;

ALTER TABLE planner.plans
  ADD CONSTRAINT category_descriptions_shape
  CHECK (planner.fn_validate_category_descriptions(category_descriptions));
