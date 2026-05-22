export interface UserProfileSourceInput {
  skills: string[];
  // Future fields (job_title, department, bio) land here — no schema migration.
  // job_title?: string | null;
  // department?: string | null;
  // bio?: string | null;
}

export function buildUserProfileSource(input: UserProfileSourceInput): string {
  const lines: string[] = [];
  if (input.skills.length > 0) lines.push(`Skills: ${input.skills.join(', ')}`);
  return lines.join('\n');
}
