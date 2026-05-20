import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';

export function sse(
  c: Context,
  body: (write: (data: unknown) => Promise<void>) => Promise<void>,
): Response {
  return streamSSE(c, async (stream) => {
    await body(async (data) => stream.writeSSE({ data: JSON.stringify(data) }));
    await stream.writeSSE({ data: '[DONE]' });
  });
}
