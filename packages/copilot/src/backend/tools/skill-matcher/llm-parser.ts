import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { RequestContextSchema, registerToolPermission } from '../_types.ts';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * One parsed candidate.
 * Fields come from identity.user (user_id, name) and
 * identity.user_profile (skills) and identity.role_grants (role).
 */
export type CandidateRaw = {
  user_id: string;
  name: string | null;
  skills: string[];
  role: string | null;
};

// ──────────────────────────────────────────────────────────────────────────────
// Tool 3 of the SkillMatcher pipeline.
//
// The agent reads each chunk's text returned by skillMatcher_contextSearch.
// For every chunk, the agent extracts structured fields:
//   user_id  — from identity.user_skill_embeddings.user_id (already in chunk)
//   name     — display name of the user
//   skills   — list of skills found in the chunk text
//   role     — the user's role inferred from the chunk or context
//
// The agent populates the `candidates` array directly (LLM-driven parsing).
// execute() deduplicates by user_id — later entry wins (higher similarity).
// ──────────────────────────────────────────────────────────────────────────────

export const skillMatcherLlmParserTool = registerToolPermission(
  createTool({
    id: 'skillMatcher_llmParser',
    description: `
Third tool in the SkillMatcher pipeline.

Parse the text chunks from skillMatcher_contextSearch into structured
candidate records. For each chunk, extract:
  - user_id  : already present in the chunk (identity.user_skill_embeddings.user_id)
  - name     : the user's display name from the chunk text
  - skills   : list of skills mentioned in the chunk text
  - role     : the user's role (e.g. "senior_engineer", "developer", "manager")

Rules:
  • One candidate entry per unique user_id.
  • If the same user appears in multiple chunks, merge their skills (union).
  • If name or role cannot be found in the text, set them to null.
  • skills must be a flat string array — no nested objects.

Call this once with ALL chunks from skillMatcher_contextSearch.
Pass the output to skillMatcher_rankCandidates.
    `.trim(),

    inputSchema: z.object({
      task_id: z.string().uuid().describe('Passed through for correlation.'),
      chunks: z
        .array(
          z.object({
            // Fields mirror ChunkResult from context-search.ts.
            user_id: z.string(),
            text: z.string(),
            similarity: z.number(),
          }),
        )
        .min(1)
        .describe('Chunks from skillMatcher_contextSearch.'),
      // Agent fills this array after reading each chunk.
      candidates: z
        .array(
          z.object({
            user_id: z.string().describe('identity.user_skill_embeddings.user_id'),
            name: z.string().nullable().describe('Display name from chunk text.'),
            skills: z.array(z.string()).describe('Skills extracted from chunk text.'),
            role: z.string().nullable().describe('Role inferred from chunk text.'),
          }),
        )
        .min(1)
        .describe(
          'Structured candidates you parsed from the chunks. ' +
            'One entry per unique user_id. Merge skills if the same user appears twice.',
        ),
    }),

    // Output schema — matches CandidateRaw.
    outputSchema: z.object({
      task_id: z.string(),
      candidates: z.array(
        z.object({
          user_id: z.string(),
          name: z.string().nullable(),
          skills: z.array(z.string()),
          role: z.string().nullable(),
        }),
      ),
      total_candidates: z.number().int(),
    }),

    requestContextSchema: RequestContextSchema,

    execute: async (input, _ctx) => {
      // Deduplicate by user_id — merge skills across duplicate entries.
      const map = new Map<string, CandidateRaw>();

      for (const c of input.candidates) {
        const existing = map.get(c.user_id);
        if (existing) {
          // Merge skills: union, deduplicated, lowercase-normalised.
          const merged = [
            ...new Set([
              ...existing.skills.map((s) => s.toLowerCase()),
              ...c.skills.map((s) => s.toLowerCase()),
            ]),
          ];
          existing.skills = merged;
          // Keep the first non-null name and role.
          if (!existing.name && c.name) existing.name = c.name;
          if (!existing.role && c.role) existing.role = c.role;
        } else {
          map.set(c.user_id, {
            user_id: c.user_id,
            name: c.name ?? null,
            skills: [...new Set(c.skills.map((s) => s.toLowerCase()))],
            role: c.role ?? null,
          });
        }
      }

      const candidates = Array.from(map.values());

      return {
        task_id: input.task_id,
        candidates,
        total_candidates: candidates.length,
      };
    },
  }),
  'identity.user.read.any',
);
