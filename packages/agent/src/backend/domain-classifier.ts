import { openai } from '@ai-sdk/openai';
import { AgentRegistry, type Domain } from '@seta/agent-sdk';
import { embed } from 'ai';

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
    const model = openai.embedding('text-embedding-3-small');
    const vectors = new Map<Domain, number[]>();
    for (const domain of domains) {
      const blurb = DOMAIN_BLURBS[domain];
      if (!blurb) continue;
      const { embedding } = await embed({ model, value: blurb });
      vectors.set(domain, embedding);
    }
    domainVectors = vectors;
  } catch (e) {
    disabled = true;
    console.warn('[domain-classifier] init failed, classifier disabled:', e);
  }
}

export async function classifyDomain(userText: string): Promise<ClassifierResult | null> {
  if (disabled || !domainVectors) return null;
  try {
    const model = openai.embedding('text-embedding-3-small');
    const { embedding } = await embed({ model, value: userText });
    let bestDomain: Domain | null = null;
    let bestScore = -1;
    for (const [domain, vec] of domainVectors) {
      const score = cosineSimilarity(embedding, vec);
      if (score > bestScore) {
        bestScore = score;
        bestDomain = domain;
      }
    }
    if (bestDomain === null || bestScore < CONFIDENCE_THRESHOLD) return null;
    return { domain: bestDomain, confidence: bestScore };
  } catch {
    return null;
  }
}
