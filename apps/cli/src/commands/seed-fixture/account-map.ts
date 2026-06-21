const EXTERNAL: Record<string, string> = {
  Veritone: 'AI',
  Aeris: 'IoT',
  'Gridbeyond Energy': 'Energy',
  Sunwest: 'Finance',
  'Motion Global': 'E-commerce',
  'Commerce Canal': 'E-commerce',
  JetX: 'Software',
  'Teacher Zone': 'EdTech',
  SSP: 'Software',
  'Smart System Pro': 'Software',
};

export function accountFor(projectName: string): { account_name: string; industry: string } {
  const ind = EXTERNAL[projectName];
  if (ind) return { account_name: projectName, industry: ind };
  return { account_name: 'SETA Internal', industry: 'Internal' };
}
