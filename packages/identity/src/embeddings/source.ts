export interface UserProfileSourceInput {
  name: string;
  skills: string[];
  availability_status: 'available' | 'busy' | 'ooo';
}

/**
 * Labeled-prose source text for user-profile embeddings.
 *
 * Pure function. Reads only the semantic content (name, skills, availability_status);
 * structured fields like ooo_until/timezone/working_hours belong to filters, not embeddings.
 *
 * Empty optional fields are omitted so the same profile before/after filling them in
 * produces a different source string → different hash → re-embed is triggered.
 */
export function buildUserProfileSource(input: UserProfileSourceInput): string {
  const lines: string[] = [`Name: ${input.name}`];
  if (input.skills.length > 0) {
    lines.push(`Skills: ${input.skills.join(', ')}`);
  }
  lines.push(`Availability: ${input.availability_status}`);
  return lines.join('\n');
}
