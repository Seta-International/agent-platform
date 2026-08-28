import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { z } from 'zod';
import {
  defaultExtractDeps,
  type ExtractDeps,
  extractAttachmentText,
} from './extract-attachment.ts';

/**
 * Generic CV/resume profile draft — the LLM extraction target shared by the
 * hiring (candidate) and people (worker) intake flows. Every field is nullable:
 * the prompt forbids guessing, and consumers treat this as a form pre-fill that
 * a human reviews before anything is persisted.
 */
export const cvProfileDraft = z.object({
  full_name: z.string().nullable(),
  personal_email: z.string().nullable(),
  phone: z.string().nullable(),
  // Use [0-9] not \d — llama.cpp JSON-schema→GBNF rejects PCRE shorthands
  // ("Failed to initialize samplers: failed to parse grammar").
  dob: z
    .string()
    .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
    .nullable(),
  gender: z.enum(['male', 'female']).nullable(),
  current_title: z.string().nullable(),
  seniority_hint: z.enum(['intern', 'junior', 'mid', 'senior', 'lead']).nullable(),
  skills: z.array(z.string()),
  summary: z.string().nullable(),
});
export type CvProfileDraft = z.infer<typeof cvProfileDraft>;

export type CvParseErrorCode = 'UNSUPPORTED_TYPE' | 'EMPTY_TEXT' | 'LLM_FAILED';

export class CvParseError extends Error {
  readonly code: CvParseErrorCode;

  constructor(code: CvParseErrorCode, message: string) {
    super(message);
    this.name = 'CvParseError';
    this.code = code;
  }
}

const INSTRUCTIONS = [
  'You extract structured profile data from a CV/resume text.',
  'Only report what is literally present in the document — never guess or infer missing data;',
  'use null for anything absent or ambiguous.',
  'Normalize dob to YYYY-MM-DD. Normalize gender to male/female only when explicitly stated.',
  'current_title is the most recent job title. seniority_hint maps the overall experience level',
  'to one of intern/junior/mid/senior/lead, or null when unclear.',
  'skills are short technology/competency names copied from the document (deduplicated),',
  'not sentences. summary is 1–2 neutral sentences describing the person.',
].join('\n');

// Plenty for any real CV; guards prompt size against pathological documents.
const MAX_TEXT_CHARS = 30_000;

export interface ParseCvProfileDeps {
  model: MastraModelConfig;
  /** Parser/sniffer override for tests; defaults to the shared attachment set. */
  extract?: ExtractDeps;
}

/**
 * Stateless CV → structured draft. Nothing is persisted here: callers decide
 * what to do with the draft (form pre-fill), and files are only stored after
 * the reviewing user confirms.
 */
export async function parseCvProfile(
  buffer: Buffer,
  filename: string,
  deps: ParseCvProfileDeps,
): Promise<CvProfileDraft> {
  let text: string;
  try {
    text = await extractAttachmentText(buffer, filename, deps.extract ?? defaultExtractDeps);
  } catch (e) {
    throw new CvParseError('UNSUPPORTED_TYPE', (e as Error).message);
  }
  if (!text.trim()) {
    throw new CvParseError('EMPTY_TEXT', 'no extractable text (scanned/image-only document?)');
  }

  const agent = new Agent({
    id: 'knowledge.cvProfileExtractor',
    name: 'CV profile extractor',
    instructions: INSTRUCTIONS,
    model: deps.model,
  });

  let object: CvProfileDraft | undefined;
  try {
    const r = await agent.generate(text.slice(0, MAX_TEXT_CHARS), {
      structuredOutput: { schema: cvProfileDraft },
    });
    object = r.object ?? undefined;
  } catch (e) {
    throw new CvParseError('LLM_FAILED', (e as Error).message);
  }
  if (!object) throw new CvParseError('LLM_FAILED', 'model returned no structured output');
  return object;
}
