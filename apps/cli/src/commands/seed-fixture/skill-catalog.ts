export interface SkillCategorySeed {
  name: string;
  skills: string[];
}

export const SKILL_CATALOG: SkillCategorySeed[] = [
  {
    name: 'Languages',
    skills: ['TypeScript', 'JavaScript', 'Python', 'Java', 'Go', 'C#', 'Kotlin', 'Swift', 'SQL'],
  },
  {
    name: 'Frontend',
    skills: ['React', 'Vue', 'Angular', 'Next.js', 'Tailwind CSS', 'HTML/CSS', 'Accessibility'],
  },
  {
    name: 'Backend',
    skills: ['Node.js', 'Hono', 'Express', 'Spring Boot', '.NET', 'GraphQL', 'REST APIs'],
  },
  {
    name: 'Cloud & DevOps',
    skills: [
      'AWS',
      'Docker',
      'Kubernetes',
      'Terraform',
      'CI/CD',
      'GitHub Actions',
      'Observability',
    ],
  },
  {
    name: 'Data',
    skills: ['PostgreSQL', 'Redis', 'pgvector', 'Kafka', 'ETL', 'Data Modeling'],
  },
  {
    name: 'QA & Testing',
    skills: [
      'Test Automation',
      'Playwright',
      'Cypress',
      'Selenium',
      'Performance Testing',
      'Manual QA',
    ],
  },
  {
    name: 'Design',
    skills: ['Figma', 'UI Design', 'UX Research', 'Prototyping', 'Design Systems'],
  },
  {
    name: 'Project Management',
    skills: ['Agile', 'Scrum', 'Kanban', 'Jira', 'Stakeholder Management', 'Roadmapping'],
  },
  {
    name: 'AI',
    skills: ['LLMs', 'Prompt Engineering', 'RAG', 'Mastra'],
  },
  {
    name: 'Professional',
    skills: ['Communication', 'Mentoring', 'Leadership'],
  },
];

// xlsx Roll (uppercased) → catalog skill names the holder is assumed to have.
export const ROLE_SKILLS: Record<string, string[]> = {
  DEV: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'REST APIs'],
  TECHLEAD: ['TypeScript', 'Node.js', 'AWS', 'Leadership', 'Mentoring'],
  QA: ['Test Automation', 'Playwright', 'Manual QA'],
  'QA AUTO': ['Test Automation', 'Cypress', 'Performance Testing'],
  AUTO: ['Test Automation', 'Selenium'],
  DEVOPS: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD'],
  DESIGNER: ['Figma', 'UI Design', 'Design Systems'],
  'UI/UX': ['Figma', 'UX Research', 'Prototyping'],
  PM: ['Agile', 'Scrum', 'Jira', 'Stakeholder Management'],
  DIRECTOR: ['Roadmapping', 'Stakeholder Management', 'Leadership'],
  'PRODUCT DIRECTOR': ['Roadmapping', 'Leadership', 'Communication'],
  ADMIN: ['Communication'],
  MARKETING: ['Communication', 'Roadmapping'],
};

const DEFAULT_SKILLS = ['Communication'];

export function skillNamesForRole(role: string): string[] {
  return ROLE_SKILLS[role.toUpperCase().trim()] ?? DEFAULT_SKILLS;
}
