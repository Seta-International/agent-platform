export interface UserProfileSourceInput {
  name: string;
  role: string;
  skills: string[];
}

export function buildUserProfileSource(input: UserProfileSourceInput): string {
  if (input.skills.length === 0) return '';
  const skillsStr = input.skills.join(', ');
  const lastTwo = input.skills.slice(-2).join(' and ');
  const primary = input.skills[0];
  return (
    `${input.name} is a ${input.role}. ` +
    `Core competencies include ${skillsStr}. ` +
    `Experienced in ${lastTwo} ` +
    `with a strong background in ${primary}.`
  );
}
