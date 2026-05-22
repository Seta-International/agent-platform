import { Button, Input, Label } from '@seta/shared-ui';
import { dequal } from 'dequal';
import { useState } from 'react';

export interface InputFormFromSchemaProps {
  schema: Record<string, unknown>;
  defaults?: Record<string, unknown>;
  original?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting?: boolean;
  submitLabel?: string;
}

type JsonValue = unknown;
type Errors = Record<string, string>;

interface LeafSpec {
  path: string[];
  type: 'string' | 'number' | 'integer' | 'boolean';
  format?: string;
  enumValues?: string[];
  required: boolean;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function collectLeaves(node: Record<string, unknown>, path: string[]): LeafSpec[] {
  if (node.type !== 'object' || typeof node.properties !== 'object' || node.properties === null) {
    return [];
  }
  const required = new Set((node.required as string[] | undefined) ?? []);
  const out: LeafSpec[] = [];
  for (const [key, raw] of Object.entries(node.properties as Record<string, unknown>)) {
    const child = raw as Record<string, unknown>;
    const childPath = [...path, key];
    if (child.type === 'object') {
      out.push(...collectLeaves(child, childPath));
      continue;
    }
    const enumValues = Array.isArray(child.enum)
      ? (child.enum.filter((v) => typeof v === 'string') as string[])
      : undefined;
    out.push({
      path: childPath,
      type: (child.type as LeafSpec['type']) ?? 'string',
      format: typeof child.format === 'string' ? child.format : undefined,
      enumValues,
      required: required.has(key),
    });
  }
  return out;
}

function readPath(values: Record<string, unknown>, path: string[]): JsonValue {
  let cursor: unknown = values;
  for (const segment of path) {
    if (cursor && typeof cursor === 'object' && segment in (cursor as object)) {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function writePath(
  values: Record<string, unknown>,
  path: string[],
  value: JsonValue,
): Record<string, unknown> {
  if (path.length === 0) return values;
  const next: Record<string, unknown> = { ...values };
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i] as string;
    const existing = cursor[segment];
    const replaced: Record<string, unknown> =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cursor[segment] = replaced;
    cursor = replaced;
  }
  cursor[path[path.length - 1] as string] = value;
  return next;
}

function coerce(raw: string, leaf: LeafSpec): JsonValue {
  if (raw === '') return undefined;
  if (leaf.type === 'number' || leaf.type === 'integer') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (leaf.type === 'boolean') return raw === 'true';
  return raw;
}

function validateLeaf(leaf: LeafSpec, value: JsonValue): string | null {
  if (value === undefined || value === '') {
    return leaf.required ? 'required' : null;
  }
  if (leaf.format === 'uuid' && typeof value === 'string' && !UUID_RE.test(value)) {
    return 'must be a UUID';
  }
  if ((leaf.type === 'number' || leaf.type === 'integer') && typeof value !== 'number') {
    return 'must be a number';
  }
  return null;
}

function labelFor(leaf: LeafSpec): string {
  return leaf.path.join(' › ');
}

function inputIdFor(leaf: LeafSpec): string {
  return `field-${leaf.path.join('.')}`;
}

function formatPriorValue(v: unknown): string {
  if (v === undefined) return '(empty)';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export function InputFormFromSchema({
  schema,
  defaults,
  original,
  onSubmit,
  submitting,
  submitLabel,
}: InputFormFromSchemaProps) {
  const leaves = collectLeaves(schema, []);
  const [values, setValues] = useState<Record<string, unknown>>(() => defaults ?? {});
  const [errors, setErrors] = useState<Errors>({});

  function handleChange(leaf: LeafSpec, raw: string) {
    const coerced = coerce(raw, leaf);
    setValues((prev) => writePath(prev, leaf.path, coerced));
    if (errors[leaf.path.join('.')]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[leaf.path.join('.')];
        return next;
      });
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: Errors = {};
    for (const leaf of leaves) {
      const err = validateLeaf(leaf, readPath(values, leaf.path));
      if (err) next[leaf.path.join('.')] = err;
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    onSubmit(values);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {leaves.map((leaf) => {
        const id = inputIdFor(leaf);
        const raw = readPath(values, leaf.path);
        const rawStr = raw === undefined || raw === null ? '' : String(raw);
        const error = errors[leaf.path.join('.')];
        const priorValue = original ? readPath(original, leaf.path) : undefined;
        const showDiff =
          original !== undefined &&
          !(priorValue === undefined && raw === undefined) &&
          !dequal(priorValue, raw);
        return (
          <div key={id} className="space-y-1.5">
            <Label htmlFor={id}>
              {labelFor(leaf)}
              {leaf.required ? <span className="text-[var(--color-danger)]"> *</span> : null}
              {showDiff ? (
                <span className="ml-2 text-xs text-[var(--color-ink-subtle)] line-through">
                  was: {formatPriorValue(priorValue)}
                </span>
              ) : null}
            </Label>
            {leaf.enumValues ? (
              <select
                id={id}
                aria-label={labelFor(leaf)}
                value={rawStr}
                onChange={(e) => handleChange(leaf, e.target.value)}
                className="block w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              >
                {!leaf.required && <option value="">—</option>}
                {leaf.enumValues.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ) : leaf.type === 'boolean' ? (
              <select
                id={id}
                aria-label={labelFor(leaf)}
                value={rawStr}
                onChange={(e) => handleChange(leaf, e.target.value)}
                className="block w-full rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            ) : (
              <Input
                id={id}
                aria-label={labelFor(leaf)}
                type={leaf.type === 'number' || leaf.type === 'integer' ? 'number' : 'text'}
                value={rawStr}
                onChange={(e) => handleChange(leaf, e.target.value)}
              />
            )}
            {error ? (
              <p className="text-xs text-[var(--color-danger)]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Submitting…' : (submitLabel ?? 'Submit')}
      </Button>
    </form>
  );
}
