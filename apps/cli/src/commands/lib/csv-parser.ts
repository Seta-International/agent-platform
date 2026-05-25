import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type {
  BucketCsvRow,
  GroupCsvRow,
  ParsedCsvs,
  PlanCsvRow,
  PlanMemberCsvRow,
  TaskCsvRow,
  TimesheetCsvRow,
  UserCsvRow,
} from './csv-types.ts';

function parseFile<T>(dir: string, filename: string): T[] {
  const content = readFileSync(join(dir, filename), 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as T[];
}

export function parseCsvs(dir: string): ParsedCsvs {
  return {
    users: parseFile<UserCsvRow>(dir, 'users.csv'),
    groups: parseFile<GroupCsvRow>(dir, 'groups.csv'),
    plans: parseFile<PlanCsvRow>(dir, 'plans.csv'),
    buckets: parseFile<BucketCsvRow>(dir, 'buckets.csv'),
    planMembers: parseFile<PlanMemberCsvRow>(dir, 'plan_members.csv'),
    tasks: parseFile<TaskCsvRow>(dir, 'tasks.csv'),
    timesheet: parseFile<TimesheetCsvRow>(dir, 'timesheet.csv'),
  };
}

export function mapPriorityNumber(raw: string): 1 | 3 | 5 | 9 {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return 5;
  if (n <= 2) return 1;
  if (n <= 4) return 3;
  if (n <= 6) return 5;
  return 9;
}

export function mapStatusFields(raw: string): { percent_complete: number; is_deferred: boolean } {
  if (raw === 'done') return { percent_complete: 100, is_deferred: false };
  if (raw === 'in progress') return { percent_complete: 50, is_deferred: false };
  return { percent_complete: 0, is_deferred: false };
}

export function splitIds(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
