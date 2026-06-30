export interface PersonProfileSourceInput {
  skills: string[];
  bio?: string;
}

export function buildPersonProfileSource(input: PersonProfileSourceInput): string {
  if (input.skills.length === 0) return '';
  const skillsStr = input.skills.join(', ');
  const lastTwo = input.skills.slice(-2).join(' and ');
  const primary = input.skills[0];
  const coreText =
    `Core competencies include ${skillsStr}. ` +
    `Experienced in ${lastTwo} with a strong background in ${primary}.`;
  return input.bio ? `${input.bio} ${coreText}` : coreText;
}
