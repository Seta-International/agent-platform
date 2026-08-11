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

/**
 * Curated synonyms → canonical catalog skill name. Task labels are free text
 * ("reactjs", "nodejs", "k8s") that rarely equal the catalog casing ("React",
 * "Node.js", "Kubernetes"). Slug normalization already unifies punctuation/case
 * (Node.js ↔ nodejs), so this list only needs the variants a slug can't bridge.
 */
export const SKILL_ALIASES: Record<string, string[]> = {
  React: ['reactjs', 'react js'],
  'Next.js': ['nextjs', 'next'],
  Vue: ['vuejs'],
  'Node.js': ['node', 'nodejs server'],
  TypeScript: ['ts'],
  JavaScript: ['js'],
  Go: ['golang', 'go lang'],
  PostgreSQL: ['postgres', 'psql'],
  'REST APIs': ['rest', 'rest api', 'restful'],
  Kubernetes: ['k8s'],
  'CI/CD': ['cicd', 'ci cd'],
  'Test Automation': ['automation testing', 'automated testing'],
  LLMs: ['llm', 'large language models'],
  'HTML/CSS': ['html', 'css'],
  'Tailwind CSS': ['tailwind'],
};

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

// Roles whose holders get a few extra tech skills on top of their role base, so that
// same-role peers don't all show an identical stack in the directory.
const TECH_ROLES = new Set(['DEV', 'TECHLEAD', 'DEVOPS', 'QA', 'QA AUTO', 'AUTO']);

const TECH_EXTRAS = [
  'JavaScript',
  'Python',
  'Go',
  'SQL',
  'Vue',
  'Next.js',
  'Tailwind CSS',
  'GraphQL',
  'Docker',
  'Kubernetes',
  'CI/CD',
  'AWS',
  'Redis',
  'Kafka',
  'Playwright',
  'LLMs',
  'RAG',
];

/**
 * A worker's mock tech stack: their role's base skills plus, for engineering roles, a
 * deterministic 1–3 extras picked from {@link TECH_EXTRAS} keyed on `seed` (a hash of the
 * employee id). Returns distinct skill names.
 */
export function techStackFor(role: string, seed: number): string[] {
  const base = skillNamesForRole(role);
  const out = new Set(base);
  if (TECH_ROLES.has(role.toUpperCase().trim())) {
    const count = 1 + (seed % 3);
    for (let i = 0; i < count; i++) {
      const extra = TECH_EXTRAS[(seed + i * 7) % TECH_EXTRAS.length];
      if (extra) out.add(extra);
    }
  }
  return [...out];
}
