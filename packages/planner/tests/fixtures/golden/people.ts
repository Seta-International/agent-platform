// packages/planner/tests/fixtures/golden/people.ts
import * as C from './constants.ts';

export interface GoldenPerson {
  person_id: string;
  user_id: string;
  full_name: string;
  email: string;
  bio: string;
  availability_status: 'available' | 'busy' | 'ooo';
  timezone: string;
  skills: { skill_name: string; level: number }[];
}

export interface GoldenSkillCategory {
  id: string;
  name: string;
  skills: { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// Skill catalog — 5 categories. Note: the table below lists 33 skills total
// (not the 30 mentioned in the summary line of the plan); the table is the
// authoritative, exhaustive source and every KEY_PEOPLE skill must resolve
// against it, so it is followed verbatim here. Deliberately excludes
// "Haskell" (a later testcase expects an empty search result for it).
// ---------------------------------------------------------------------------

interface CategorySpec {
  name: string;
  skills: string[];
}

const CATEGORY_SPECS: CategorySpec[] = [
  {
    name: 'Frontend',
    skills: ['React', 'Vue', 'CSS', 'TypeScript', 'HTML', 'a11y', 'Next.js', 'Tailwind'],
  },
  {
    name: 'Backend',
    skills: ['Node.js', 'Go', 'Python', 'Java', 'FastAPI', 'Spring Boot', 'GraphQL', 'gRPC'],
  },
  {
    name: 'Data',
    skills: ['PostgreSQL', 'Redis', 'Kafka', 'ML', 'Elasticsearch'],
  },
  {
    name: 'DevOps',
    skills: ['Docker', 'Kubernetes', 'Terraform', 'AWS', 'CI/CD', 'GitHub Actions', 'Ansible'],
  },
  {
    name: 'Other',
    skills: ['Testing', 'Leadership', 'Content', 'SEO', 'Analytics'],
  },
];

let _skillRunningIndex = 0;

export const SKILL_CATALOG: GoldenSkillCategory[] = CATEGORY_SPECS.map((cat, catIndex) => ({
  id: C.seededId('skcat000', catIndex),
  name: cat.name,
  skills: cat.skills.map((skillName) => ({
    id: C.seededId('skill000', _skillRunningIndex++),
    name: skillName,
  })),
}));

/** Flattened pool of every catalog skill name, in catalog order. */
const SKILL_POOL: string[] = SKILL_CATALOG.flatMap((cat) => cat.skills.map((s) => s.name));

// ---------------------------------------------------------------------------
// Key people — 12 named specimens used directly by testcases.
// ---------------------------------------------------------------------------

export const KEY_PEOPLE: GoldenPerson[] = [
  {
    person_id: C.ACTOR_PERSON_ID,
    user_id: C.ACTOR_USER_ID,
    full_name: 'Anh Nguyen',
    email: 'anh.nguyen@seta-demo.test',
    bio: 'Engineering lead coordinating cross-team delivery at SETA International.',
    availability_status: 'available',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: [
      { skill_name: 'TypeScript', level: 4 },
      { skill_name: 'React', level: 3 },
      { skill_name: 'Leadership', level: 4 },
    ],
  },
  {
    person_id: C.PERSON_TUAN_ID,
    user_id: C.USER_TUAN_ID,
    full_name: 'Tuan Nguyen',
    email: 'tuan.nguyen@seta-demo.test',
    bio: 'Backend engineer specializing in services written in Go and TypeScript.',
    availability_status: 'available',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: [
      { skill_name: 'TypeScript', level: 5 },
      { skill_name: 'Go', level: 4 },
      { skill_name: 'Docker', level: 3 },
    ],
  },
  {
    person_id: C.PERSON_LINH_ID,
    user_id: C.USER_LINH_ID,
    full_name: 'Linh Nguyen',
    email: 'linh.nguyen@seta-demo.test',
    bio: 'Frontend engineer focused on accessible, polished React interfaces.',
    availability_status: 'available',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: [
      { skill_name: 'React', level: 5 },
      { skill_name: 'CSS', level: 4 },
      { skill_name: 'a11y', level: 3 },
    ],
  },
  {
    person_id: C.PERSON_MINH_ID,
    user_id: C.USER_MINH_ID,
    full_name: 'Minh Nguyen',
    email: 'minh.nguyen@seta-demo.test',
    bio: 'Full-stack engineer working across React frontends and Node.js services.',
    availability_status: 'available',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: [
      { skill_name: 'React', level: 4 },
      { skill_name: 'Python', level: 3 },
      { skill_name: 'Node.js', level: 4 },
    ],
  },
  {
    person_id: C.PERSON_DUC_ID,
    user_id: C.USER_DUC_ID,
    full_name: 'Duc Tran',
    email: 'duc.tran@seta-demo.test',
    bio: 'Product engineer with a strong focus on test coverage and reliability.',
    availability_status: 'available',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: [
      { skill_name: 'TypeScript', level: 4 },
      { skill_name: 'React', level: 3 },
      { skill_name: 'Testing', level: 4 },
    ],
  },
  {
    person_id: C.PERSON_HOA_ID,
    user_id: C.USER_HOA_ID,
    full_name: 'Hoa Pham',
    email: 'hoa.pham@seta-demo.test',
    bio: 'Machine learning engineer building and shipping FastAPI-backed ML services.',
    availability_status: 'busy',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: [
      { skill_name: 'Python', level: 5 },
      { skill_name: 'ML', level: 4 },
      { skill_name: 'FastAPI', level: 4 },
    ],
  },
  {
    person_id: C.PERSON_THANH_ID,
    user_id: C.USER_THANH_ID,
    full_name: 'Thanh Le',
    email: 'thanh.le@seta-demo.test',
    bio: 'Frontend engineer building Vue applications on top of GraphQL APIs.',
    availability_status: 'available',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: [
      { skill_name: 'TypeScript', level: 3 },
      { skill_name: 'Vue', level: 4 },
      { skill_name: 'GraphQL', level: 3 },
    ],
  },
  {
    person_id: C.PERSON_CHI_ID,
    user_id: C.USER_CHI_ID,
    full_name: 'Chi Vo',
    email: 'chi.vo@seta-demo.test',
    bio: 'Platform engineer running Kubernetes infrastructure on AWS.',
    availability_status: 'available',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: [
      { skill_name: 'Kubernetes', level: 5 },
      { skill_name: 'Terraform', level: 4 },
      { skill_name: 'AWS', level: 5 },
    ],
  },
  {
    person_id: C.PERSON_NAM_ID,
    user_id: C.USER_NAM_ID,
    full_name: 'Nam Hoang',
    email: 'nam.hoang@seta-demo.test',
    bio: 'Backend engineer building high-throughput Go services over gRPC.',
    availability_status: 'available',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: [
      { skill_name: 'Go', level: 4 },
      { skill_name: 'gRPC', level: 3 },
      { skill_name: 'PostgreSQL', level: 4 },
    ],
  },
  {
    person_id: C.PERSON_LAN_ID,
    user_id: C.USER_LAN_ID,
    full_name: 'Lan Bui',
    email: 'lan.bui@seta-demo.test',
    bio: 'Backend engineer maintaining Spring Boot services and Kafka pipelines.',
    availability_status: 'available',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: [
      { skill_name: 'Java', level: 4 },
      { skill_name: 'Spring Boot', level: 4 },
      { skill_name: 'Kafka', level: 3 },
    ],
  },
  {
    person_id: C.PERSON_KHOA_ID,
    user_id: C.USER_KHOA_ID,
    full_name: 'Khoa Do',
    email: 'khoa.do@seta-demo.test',
    bio: 'DevOps engineer owning CI/CD pipelines and infrastructure automation.',
    availability_status: 'available',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: [
      { skill_name: 'CI/CD', level: 4 },
      { skill_name: 'GitHub Actions', level: 4 },
      { skill_name: 'Ansible', level: 3 },
    ],
  },
  {
    person_id: C.PERSON_THAO_ID,
    user_id: C.USER_THAO_ID,
    full_name: 'Thao Dang',
    email: 'thao.dang@seta-demo.test',
    bio: 'Marketing specialist driving content strategy and growth analytics.',
    availability_status: 'available',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: [
      { skill_name: 'Content', level: 4 },
      { skill_name: 'SEO', level: 3 },
      { skill_name: 'Analytics', level: 3 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Generated people — 38 records with Vietnamese names and deterministic
// skill/level assignment (index-derived, no Math.random()).
// ---------------------------------------------------------------------------

const GENERATED_NAMES: string[] = [
  'Quang Pham',
  'Huong Tran',
  'Dat Nguyen',
  'Mai Le',
  'Tung Vo',
  'Nhi Dang',
  'Bao Hoang',
  'Vy Ly',
  'Son Do',
  'Phuong Bui',
  'Khanh Ngo',
  'An Truong',
  'Ha Duong',
  'Tai Lam',
  'Ngoc Dinh',
  'Phuc Le',
  'Thi Cao',
  'Long Ha',
  'My Luong',
  'Cuong Trinh',
  'Hang Vu',
  'Vinh Ton',
  'Uyen Phan',
  'Hieu Tran',
  'Thuy Mai',
  'Duy Luu',
  'Trang Huynh',
  'Quoc Dao',
  'Yen Chau',
  'Tam Nguyen',
  'Binh Tran',
  'Huy Le',
  'Nhu Pham',
  'Sang Vo',
  'Tuyet Hoang',
  'Khai Do',
  'Lien Bui',
  'Phong Ngo',
];

/**
 * Deterministically picks `count` distinct skill names from the catalog pool
 * for generated person index `i`. Uses a fixed step coprime with the pool
 * size so the selected positions never collide within a single person.
 */
function pickSkills(i: number, count: number): { skill_name: string; level: number }[] {
  const poolSize = SKILL_POOL.length;
  const base = (i * 7) % poolSize;
  const step = 5; // gcd(5, poolSize) === 1 for our pool size, so no collisions
  const picked: { skill_name: string; level: number }[] = [];
  for (let k = 0; k < count; k++) {
    const idx = (base + k * step) % poolSize;
    const level = 1 + ((i + k * 2) % 5);
    picked.push({ skill_name: SKILL_POOL[idx]!, level });
  }
  return picked;
}

export const GENERATED_PEOPLE: GoldenPerson[] = GENERATED_NAMES.map((name, i) => {
  const [first, last] = name.split(' ');
  const email = `${first!.toLowerCase()}.${last!.toLowerCase()}@seta-demo.test`;
  const skillCount = 3 + (i % 3); // 3, 4, or 5 skills

  return {
    person_id: C.seededId('genpers0', i),
    user_id: C.seededId('genusr00', i),
    full_name: name,
    email,
    bio: 'Software engineer at SETA International.',
    availability_status: 'available',
    timezone: 'Asia/Ho_Chi_Minh',
    skills: pickSkills(i, skillCount),
  };
});

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const ALL_PEOPLE: GoldenPerson[] = [...KEY_PEOPLE, ...GENERATED_PEOPLE];
