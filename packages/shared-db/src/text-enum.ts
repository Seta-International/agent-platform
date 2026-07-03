import { sql } from 'drizzle-orm';
import { check, text } from 'drizzle-orm/pg-core';

export function textEnum<const V extends readonly [string, ...string[]]>(name: string, values: V) {
  return text(name, { enum: values });
}

export function textEnumValuesSql(values: readonly string[]): string {
  return values.map((v) => `'${v.replaceAll("'", "''")}'`).join(', ');
}

export function textEnumCheck(tableName: string, columnName: string, values: readonly string[]) {
  return check(
    `${tableName}_${columnName}_check`,
    sql.raw(`${columnName} IN (${textEnumValuesSql(values)})`),
  );
}
