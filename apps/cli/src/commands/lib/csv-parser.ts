import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type {
  BucketCsvRow,
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
    plans: parseFile<PlanCsvRow>(dir, 'plans.csv'),
    buckets: parseFile<BucketCsvRow>(dir, 'buckets.csv'),
    planMembers: parseFile<PlanMemberCsvRow>(dir, 'plan_members.csv'),
    tasks: parseFile<TaskCsvRow>(dir, 'tasks.csv'),
    timesheet: parseFile<TimesheetCsvRow>(dir, 'timesheet.csv'),
  };
}

export function mapPriority(raw: string): 'urgent' | 'important' | 'medium' | 'low' {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return 'medium';
  if (n <= 2) return 'urgent';
  if (n <= 4) return 'important';
  if (n <= 6) return 'medium';
  return 'low';
}

export function mapStatus(raw: string): 'not_started' | 'in_progress' | 'completed' | 'deferred' {
  if (raw === 'done') return 'completed';
  if (raw === 'in progress') return 'in_progress';
  return 'not_started';
}

export function splitIds(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
