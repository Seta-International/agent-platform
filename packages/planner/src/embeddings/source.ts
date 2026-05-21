export interface TaskSourceInput {
  title: string;
  description: string | null;
  skill_tags: string[];
}

/**
 * Labeled-prose source text for task embeddings.
 *
 * Pure function. Reads only the semantic content (title, description, skill_tags);
 * structured fields like priority/percent/due_at belong to filters, not embeddings.
 *
 * Empty optional fields are omitted so the same task before/after filling them in
 * produces a different source string → different hash → re-embed is triggered.
 */
export function buildTaskSource(input: TaskSourceInput): string {
  const lines: string[] = [`Title: ${input.title}`];
  if (input.description !== null && input.description.length > 0) {
    lines.push(`Description: ${input.description}`);
  }
  if (input.skill_tags.length > 0) {
    lines.push(`Skills: ${input.skill_tags.join(', ')}`);
  }
  return lines.join('\n');
}
