import { z } from 'zod';

/** Every QnA sub-agent takes a single natural-language query (already carrying
 *  any page-context prefix injected upstream) and returns prose. */
export const QnaSubAgentInputSchema = z.object({
  query: z.string().describe('The user question, with any page-context prefix already inlined.'),
});
export type QnaSubAgentInput = z.infer<typeof QnaSubAgentInputSchema>;

export const QnaSubAgentOutputSchema = z.object({
  answer: z.string().describe('The prose answer for this sub-question.'),
});
export type QnaSubAgentOutput = z.infer<typeof QnaSubAgentOutputSchema>;
