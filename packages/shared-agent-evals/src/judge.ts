import type { MastraModelConfig } from '@mastra/core/llm';
import { MockLanguageModelV3 } from 'ai/test';

/** The model a judge scorer runs its rubric/relevancy prompt on. */
export type JudgeModel = MastraModelConfig;

export interface JudgeConfig {
  /** Injected — the harness never hard-imports a provider. Production wires
   *  resolveModel('auto', { tierHint: 'fast' }).model at temperature 0. */
  model: JudgeModel;
}

/** Minimal JSON Schema shape we need to synthesize a conforming value —
 *  narrower than the full `JSONSchema7` type from `@ai-sdk/provider`, but
 *  covers every shape the prebuilt `@mastra/evals` scorers request. */
interface JsonSchemaLike {
  type?: string;
  properties?: Record<string, JsonSchemaLike>;
  required?: string[];
  items?: JsonSchemaLike;
  enum?: unknown[];
}

/**
 * Fills in a value that structurally satisfies `schema`, biasing any
 * `score`-named numeric field to `score` and any other string field to
 * `'yes'` (the affirmative pole most LLM-judge verdict enums use — e.g.
 * relevant/irrelevant, entailed/contradicted — so a per-statement verdict
 * step feeds a plausible, schema-valid signal into whatever generateScore
 * step reduces it, rather than an arbitrary placeholder that always reduces
 * to zero).
 */
function synthesizeFromSchema(schema: JsonSchemaLike | undefined, score: number): unknown {
  if (!schema || typeof schema !== 'object') return { score };
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  switch (schema.type) {
    case 'object': {
      const properties = schema.properties ?? {};
      const required = schema.required ?? Object.keys(properties);
      const out: Record<string, unknown> = {};
      for (const key of required) {
        // Only bias a `/score/i`-named field to the numeric score when its
        // declared type is actually numeric — a `score`-named `string` field
        // (e.g. a verdict enum) must still fall through to the default
        // string/enum handling below instead of getting a number.
        const fieldSchema = properties[key];
        const isNumericScoreField =
          /score/i.test(key) && (fieldSchema?.type === 'number' || fieldSchema?.type === 'integer');
        out[key] = isNumericScoreField ? score : synthesizeFromSchema(fieldSchema, score);
      }
      return out;
    }
    case 'array':
      return [synthesizeFromSchema(schema.items, score)];
    case 'number':
    case 'integer':
      return score;
    case 'boolean':
      return true;
    default:
      return 'yes';
  }
}

/**
 * A deterministic, key-free judge model for harness self-tests. Each call to
 * the model returns a canned, schema-conformant response derived from the
 * next score in `scores` (cycling), never used in the real lane.
 *
 * Both `doGenerate` and `doStream` are implemented, and both are
 * schema-aware: any code path that drives the model — including
 * `Agent.stream()`, which every prebuilt `@mastra/evals` scorer
 * (`createAnswerRelevancyScorer`, `createToxicityScorer`, etc.) uses
 * internally — gets a deterministic, offline response either way.
 *
 * Verified by hand against the installed `@mastra/evals@1.5.1`: the prebuilt
 * scorers run a *multi-step* internal workflow (e.g. preprocess → analyze →
 * generateScore → generateReason), and each step requests a different
 * structured-output JSON schema from the model (`options.responseFormat.
 * schema`, a JSON Schema). A model that always returns a flat `{score}`
 * satisfies the *transport* contract but throws
 * `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED` on the first step whose schema
 * isn't `{score}` shaped. `synthesizeFromSchema` reads that per-call schema
 * and fills in a conforming value instead, so the fake can drive a full
 * multi-step prebuilt scorer to a genuine `run()` result end to end. Steps
 * that request free text (no `responseFormat.schema`, e.g. `generateReason`)
 * still get the flat `{"score": n}` text, matching the original behavior.
 */
export function fakeJudgeModel(scores: number[] = [1]): JudgeModel {
  let generateCall = 0;
  let streamCall = 0;
  const nextText = (call: number, schema: JsonSchemaLike | undefined) => {
    // `noUncheckedIndexedAccess` can't see that `call % scores.length` is
    // always in bounds for a non-empty array — the `?? 0` never fires.
    const score = scores[call % scores.length] ?? 0;
    return JSON.stringify(synthesizeFromSchema(schema, score));
  };
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      const schema = (options as { responseFormat?: { schema?: JsonSchemaLike } }).responseFormat
        ?.schema;
      const text = nextText(generateCall, schema);
      generateCall += 1;
      return {
        finishReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        content: [{ type: 'text', text }],
        warnings: [],
      } as never;
    },
    doStream: async (options) => {
      const schema = (options as { responseFormat?: { schema?: JsonSchemaLike } }).responseFormat
        ?.schema;
      const text = nextText(streamCall, schema);
      streamCall += 1;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: '0' });
            controller.enqueue({ type: 'text-delta', id: '0', delta: text });
            controller.enqueue({ type: 'text-end', id: '0' });
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            });
            controller.close();
          },
        }),
      } as never;
    },
  }) as unknown as JudgeModel;
}
