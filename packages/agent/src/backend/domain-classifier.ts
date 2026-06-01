import { AgentRegistry, type Domain } from '@seta/agent-sdk';
import { resolveEmbeddingProvider } from '@seta/shared-embeddings';

const CONFIDENCE_THRESHOLD = 0.75;

const DOMAIN_BLURBS: Record<Domain, string> = {
  work: 'Tasks, plans, projects, deliverables, time tracking',
  people: 'Users, roles, permissions, org structure',
  self: 'Current user profile, preferences, notifications',
  meta: 'About this assistant: capabilities, status, settings',
  knowledge:
    'Company documents, policies, handbooks, internal knowledge base — search uploaded files by semantic similarity',
};

export type ClassifierResult = { domain: Domain; confidence: number };

let domainVectors: Map<Domain, number[]> | null = null;
let disabled = false;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function initClassifier(): Promise<void> {
  try {
    const domains = AgentRegistry.snapshot().domains as Domain[];
    const entries = domains
      .map((domain) => ({ domain, blurb: DOMAIN_BLURBS[domain] }))
      .filter((e): e is { domain: Domain; blurb: string } => Boolean(e.blurb));
    const embeddings = await resolveEmbeddingProvider().embed(entries.map((e) => e.blurb));
    const vectors = new Map<Domain, number[]>();
    entries.forEach((e, i) => {
      const vec = embeddings[i];
      if (vec) vectors.set(e.domain, vec);
    });
    domainVectors = vectors;
  } catch (e) {
    disabled = true;
    console.warn('[domain-classifier] init failed, classifier disabled:', e);
  }
}

// Keyword-based fallback used when the embedding classifier is disabled or errors.
// Intentionally coarse — only covers unambiguous signals; tie = null (let topAgent route).
const KEYWORD_RULES: Array<{ patterns: RegExp; domain: Domain }> = [
  {
    patterns:
      /\b(task|tasks|plan|plans|bucket|buckets|project|projects|assign|assignee|checklist|milestone|deliverable|sprint|backlog|ticket|issue|story|epic|roadmap|review\s+state|needs?\s+review)\b/i,
    domain: 'work',
  },
  {
    patterns:
      /\b(user|users|member|members|role|roles|permission|permissions|team|teams|org|organisation|organization|staff|employee|employees|hire|onboard)\b/i,
    domain: 'people',
  },
  {
    patterns: /\b(my\s+profile|my\s+account|my\s+notification|my\s+preference|my\s+setting)\b/i,
    domain: 'self',
  },
  {
    patterns:
      /\b(document|documents|policy|policies|handbook|wiki|knowledge\s+base|search\s+files?|uploaded\s+files?)\b/i,
    domain: 'knowledge',
  },
];

function keywordClassify(text: string): Domain | null {
  const matched: Domain[] = [];
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.test(text) && !matched.includes(rule.domain)) {
      matched.push(rule.domain);
    }
  }
  // Only route if exactly one domain matches — ambiguous = null
  return matched.length === 1 ? (matched[0] ?? null) : null;
}

export async function classifyDomain(userText: string): Promise<ClassifierResult | null> {
  if (disabled || !domainVectors) {
    const domain = keywordClassify(userText);
    return domain ? { domain, confidence: 0.8 } : null;
  }
  try {
    const [embedding] = await resolveEmbeddingProvider().embed([userText]);
    if (!embedding) {
      const kwDomain = keywordClassify(userText);
      return kwDomain ? { domain: kwDomain, confidence: 0.8 } : null;
    }
    let bestDomain: Domain | null = null;
    let bestScore = -1;
    for (const [domain, vec] of domainVectors) {
      const score = cosineSimilarity(embedding, vec);
      if (score > bestScore) {
        bestScore = score;
        bestDomain = domain;
      }
    }
    if (bestDomain === null || bestScore < CONFIDENCE_THRESHOLD) {
      // Embedding wasn't confident — try keyword as a safety net
      const kwDomain = keywordClassify(userText);
      return kwDomain ? { domain: kwDomain, confidence: 0.8 } : null;
    }
    return { domain: bestDomain, confidence: bestScore };
  } catch {
    const domain = keywordClassify(userText);
    return domain ? { domain, confidence: 0.8 } : null;
  }
}
