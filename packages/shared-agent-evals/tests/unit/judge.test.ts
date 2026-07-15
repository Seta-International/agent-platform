import type { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { fakeJudgeModel } from '../../src/judge.ts';

/** Minimal call options — the fake ignores its input entirely, but the
 *  `doGenerate`/`doStream` signatures require a `prompt`. */
const CALL_OPTIONS = { prompt: [] } as never;

/** Drains a mocked `doStream` `ReadableStream` of `LanguageModelV3StreamPart`s
 *  down to the concatenated `text-delta` text — the same text a real scorer
 *  reconstructs via `Agent.stream()`. */
async function readStreamText(stream: ReadableStream<unknown>): Promise<string> {
  let text = '';
  for await (const part of stream as unknown as AsyncIterable<{
    type: string;
    delta?: string;
  }>) {
    if (part.type === 'text-delta' && typeof part.delta === 'string') {
      text += part.delta;
    }
  }
  return text;
}

describe('fakeJudgeModel', () => {
  it('is a real, callable MastraModelConfig (not a string spec)', () => {
    const model = fakeJudgeModel([0.5]);
    expect(typeof model).not.toBe('string');
    expect(model).not.toBeNull();
  });

  it('doGenerate returns the canned score as {"score": n} text', async () => {
    const model = fakeJudgeModel([0.5]) as unknown as MockLanguageModelV3;
    const result = await model.doGenerate(CALL_OPTIONS);
    const [content] = result.content;
    expect(content).toMatchObject({ type: 'text' });
    expect(JSON.parse((content as { text: string }).text)).toEqual({ score: 0.5 });
  });

  it('doStream — the path the prebuilt @mastra/evals scorers actually use — streams the canned score', async () => {
    const model = fakeJudgeModel([0.5]) as unknown as MockLanguageModelV3;
    const { stream } = await model.doStream(CALL_OPTIONS);
    const text = await readStreamText(stream);
    expect(JSON.parse(text)).toEqual({ score: 0.5 });
  });

  it('rotates doStream output through `scores` via scores[call % length]', async () => {
    const model = fakeJudgeModel([0.2, 0.9]) as unknown as MockLanguageModelV3;

    const first = await model.doStream(CALL_OPTIONS);
    const firstText = await readStreamText(first.stream);
    expect(JSON.parse(firstText)).toEqual({ score: 0.2 });

    const second = await model.doStream(CALL_OPTIONS);
    const secondText = await readStreamText(second.stream);
    expect(JSON.parse(secondText)).toEqual({ score: 0.9 });

    // Wraps back around (call 2 % 2 === 0).
    const third = await model.doStream(CALL_OPTIONS);
    const thirdText = await readStreamText(third.stream);
    expect(JSON.parse(thirdText)).toEqual({ score: 0.2 });
  });

  it('keeps independent call counters for doGenerate and doStream', async () => {
    const model = fakeJudgeModel([0.2, 0.9]) as unknown as MockLanguageModelV3;

    const generated = await model.doGenerate(CALL_OPTIONS);
    expect(JSON.parse((generated.content[0] as { text: string }).text)).toEqual({ score: 0.2 });

    // First doStream call should still land on index 0, not be advanced by
    // the prior doGenerate call — the two counters are independent.
    const streamed = await model.doStream(CALL_OPTIONS);
    const text = await readStreamText(streamed.stream);
    expect(JSON.parse(text)).toEqual({ score: 0.2 });
  });
});
