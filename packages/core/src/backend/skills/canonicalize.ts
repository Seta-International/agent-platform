import { withTenantTx } from '@seta/shared-db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { coreDb } from '../../db/client.ts';
import { coreSkill, coreSkillAlias } from '../../db/schema/skills.ts';
import type { SessionScope } from '../../session/scope.ts';
import { CoreSkillError, requireSkillPermission } from './error.ts';

/** Minimal tenant handle — canonicalization is called from workflows that hold no full session. */
type TenantRef = Pick<SessionScope, 'tenant_id'>;

/**
 * Normalize free-text skill mentions to a comparison key: lowercase, decompose
 * accents, and drop every non-alphanumeric character. So "React", "react", and
 * "React.js"/"ReactJS" collapse to `react`/`reactjs` respectively, and
 * "Node.js" and "nodejs" both become `nodejs`. Punctuation-only input → "".
 */
export function slugifySkill(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export interface CanonicalSkill {
  skill_id: string;
  name: string;
}

/**
 * Resolve a free-text skill mention (e.g. a task label "reactjs") to a canonical
 * `core.skill` in the tenant. Matches first by the skill's own slug, then by a
 * registered alias slug. Returns null when nothing matches — callers fall back to
 * fuzzy/reasoning matching. Tenant-scoped; a normalization utility, not a
 * permissioned catalog read. Runs in a tenant tx so RLS resolves from workflows.
 */
export async function canonicalizeSkill(
  tenant: TenantRef,
  text: string,
): Promise<CanonicalSkill | null> {
  const slug = slugifySkill(text);
  if (!slug) return null;

  return withTenantTx(coreDb(), tenant.tenant_id, async (tx) => {
    const [direct] = await tx
      .select({ skill_id: coreSkill.id, name: coreSkill.name })
      .from(coreSkill)
      .where(
        and(
          eq(coreSkill.tenant_id, tenant.tenant_id),
          eq(coreSkill.slug, slug),
          eq(coreSkill.active, true),
        ),
      )
      .orderBy(asc(coreSkill.name))
      .limit(1);
    if (direct) return direct;

    const [aliased] = await tx
      .select({ skill_id: coreSkill.id, name: coreSkill.name })
      .from(coreSkillAlias)
      .innerJoin(coreSkill, eq(coreSkill.id, coreSkillAlias.skill_id))
      .where(
        and(
          eq(coreSkillAlias.tenant_id, tenant.tenant_id),
          eq(coreSkillAlias.slug, slug),
          eq(coreSkill.active, true),
        ),
      )
      .limit(1);
    return aliased ?? null;
  });
}

/**
 * Resolve many free-text mentions at once, returning the distinct canonical
 * skills that matched (mentions with no match are dropped). Order-preserving,
 * de-duplicated by skill_id.
 */
export async function canonicalizeSkills(
  tenant: TenantRef,
  texts: readonly string[],
): Promise<CanonicalSkill[]> {
  const out: CanonicalSkill[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    const hit = await canonicalizeSkill(tenant, text);
    if (hit && !seen.has(hit.skill_id)) {
      seen.add(hit.skill_id);
      out.push(hit);
    }
  }
  return out;
}

const MAX_SKILL_NGRAM = 3;
const MIN_MENTION_SLUG_LEN = 3;
const MAX_MENTION_TOKENS = 200;

/**
 * Extract the catalog skills a free-text passage mentions — the deterministic
 * counterpart to task labels. Slides a 1–3 word window over the text, resolves
 * each window through the same slug + alias catalog, and returns the distinct
 * skills found. So "Migrate the ReactJS front-end… consolidate our Node.js
 * services" yields {React, Node.js} with no labels, no LLM, and no embeddings.
 *
 * Windows whose comparison slug is under {@link MIN_MENTION_SLUG_LEN} chars are
 * skipped so common words never collide with 1–2 char catalog skills ("Go",
 * "R", "C"). One tenant tx, two set-membership queries — safe on the hot path.
 */
export async function extractSkillMentions(
  tenant: TenantRef,
  text: string,
): Promise<CanonicalSkill[]> {
  const tokens = text.split(/\s+/).filter(Boolean).slice(0, MAX_MENTION_TOKENS);
  if (tokens.length === 0) return [];

  const slugs = new Set<string>();
  for (let n = 1; n <= MAX_SKILL_NGRAM; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const slug = slugifySkill(tokens.slice(i, i + n).join(' '));
      if (slug.length >= MIN_MENTION_SLUG_LEN) slugs.add(slug);
    }
  }
  if (slugs.size === 0) return [];
  const wanted = [...slugs];

  return withTenantTx(coreDb(), tenant.tenant_id, async (tx) => {
    const direct = await tx
      .select({ skill_id: coreSkill.id, name: coreSkill.name })
      .from(coreSkill)
      .where(
        and(
          eq(coreSkill.tenant_id, tenant.tenant_id),
          eq(coreSkill.active, true),
          inArray(coreSkill.slug, wanted),
        ),
      );
    const aliased = await tx
      .select({ skill_id: coreSkill.id, name: coreSkill.name })
      .from(coreSkillAlias)
      .innerJoin(coreSkill, eq(coreSkill.id, coreSkillAlias.skill_id))
      .where(
        and(
          eq(coreSkillAlias.tenant_id, tenant.tenant_id),
          eq(coreSkill.active, true),
          inArray(coreSkillAlias.slug, wanted),
        ),
      );

    const out: CanonicalSkill[] = [];
    const seen = new Set<string>();
    for (const r of [...direct, ...aliased]) {
      if (!seen.has(r.skill_id)) {
        seen.add(r.skill_id);
        out.push({ skill_id: r.skill_id, name: r.name });
      }
    }
    return out;
  });
}

/**
 * Register a synonym/variant that resolves to an existing catalog skill.
 * Idempotent per (tenant, alias slug): re-adding the same variant re-points it.
 */
export async function createSkillAlias(input: {
  input: { skill_id: string; alias: string };
  session: SessionScope;
}): Promise<{ id: string }> {
  const { session } = input;
  requireSkillPermission(session, 'core.skill.manage');
  const alias = input.input.alias.trim();
  if (!alias) throw new CoreSkillError('VALIDATION', 'alias required');
  const slug = slugifySkill(alias);
  if (!slug) throw new CoreSkillError('VALIDATION', 'alias has no comparable characters');

  return withTenantTx(coreDb(), session.tenant_id, async (tx) => {
    const [skill] = await tx
      .select({ id: coreSkill.id })
      .from(coreSkill)
      .where(
        and(eq(coreSkill.id, input.input.skill_id), eq(coreSkill.tenant_id, session.tenant_id)),
      )
      .limit(1);
    if (!skill) throw new CoreSkillError('NOT_FOUND', 'skill not found');

    const [row] = await tx
      .insert(coreSkillAlias)
      .values({ tenant_id: session.tenant_id, skill_id: input.input.skill_id, alias, slug })
      .onConflictDoUpdate({
        target: [coreSkillAlias.tenant_id, coreSkillAlias.slug],
        set: { skill_id: input.input.skill_id, alias, updated_at: new Date() },
      })
      .returning({ id: coreSkillAlias.id });
    if (!row) throw new CoreSkillError('VALIDATION', 'alias insert returned no row');
    return { id: row.id };
  });
}
