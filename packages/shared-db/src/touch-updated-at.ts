const IDENT = /^[a-z_][a-z0-9_]*$/;

function assertIdent(name: string): void {
  if (!IDENT.test(name)) throw new Error(`unsafe SQL identifier: ${name}`);
}

export function buildTouchUpdatedAtFnSql(schema: string): string {
  assertIdent(schema);
  return `CREATE OR REPLACE FUNCTION ${schema}.tg_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;`;
}

export function buildTouchTriggerSql(schema: string, table: string): string {
  assertIdent(schema);
  assertIdent(table);
  return `CREATE TRIGGER ${table}_touch_updated_at
BEFORE UPDATE ON ${schema}.${table}
FOR EACH ROW EXECUTE FUNCTION ${schema}.tg_touch_updated_at();`;
}
