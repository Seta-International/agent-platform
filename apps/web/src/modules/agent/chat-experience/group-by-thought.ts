/** Groups the parts that make up the agent's "chain of thought" (reasoning +
 *  tool calls) so the transcript can collapse them under one disclosure. */
export const groupByThought = (part: { type: string; text?: string }) => {
  // Reasoning models emit a `reasoning` part with no summary text (encrypted
  // content withheld); grouping it would spawn a "Thought · 1 step" disclosure
  // that expands to nothing, since ReasoningPart renders null for empty text.
  if (part.type === 'reasoning')
    return (part.text ?? '').length > 0 ? (['group-thought'] as const) : null;
  if (part.type === 'tool-call') return ['group-thought'] as const;
  return null;
};
