import { z } from 'zod';

/** Every QnA sub-agent takes a single natural-language query (already carrying
 *  any page-context prefix injected upstream) and returns prose. */
export const QuerySubAgentInputSchema = z.object({
  query: z.string().describe('The user question, with any page-context prefix already inlined.'),
});
export type QuerySubAgentInput = z.infer<typeof QuerySubAgentInputSchema>;

export const QuerySubAgentOutputSchema = z.object({
  answer: z.string().describe('The prose answer for this sub-question.'),
});
export type QuerySubAgentOutput = z.infer<typeof QuerySubAgentOutputSchema>;
