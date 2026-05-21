const OPENAI_BASE = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 25 * 60 * 60 * 1000; // 25 hours
const DEFAULT_POLL_INTERVAL_MS = 10_000; // 10 seconds

export interface BatchInputRow {
  custom_id: string;
  input: string;
}

export interface BatchResultRow {
  custom_id: string;
  vector: number[];
}

export interface OpenAIBatchClient {
  apiKey: string;
  fetch?: typeof fetch;
}

export interface SubmitOptions extends OpenAIBatchClient {
  model: 'text-embedding-3-small' | 'text-embedding-3-large';
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

function resolveFetch(injectable?: typeof fetch): typeof fetch {
  return injectable ?? globalThis.fetch;
}

async function assertOk(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => '(unreadable)');
    throw new Error(`OpenAI ${context} failed: HTTP ${res.status} — ${text}`);
  }
}

/**
 * Build a JSONL bundle, upload it as a batch file, then create a batch job.
 * Returns the batchId.
 */
export async function submitBatch(opts: SubmitOptions, inputs: BatchInputRow[]): Promise<string> {
  const { apiKey, model, fetch: injectable } = opts;
  const fetcher = resolveFetch(injectable);

  // 1. Build JSONL
  const lines = inputs.map((row) =>
    JSON.stringify({
      custom_id: row.custom_id,
      method: 'POST',
      url: '/v1/embeddings',
      body: { model, input: row.input },
    }),
  );
  const jsonl = lines.join('\n');

  // 2. Upload file (multipart/form-data)
  const formData = new FormData();
  formData.append('purpose', 'batch');
  formData.append('file', new Blob([jsonl], { type: 'application/jsonl' }), 'batch.jsonl');

  const fileRes = await fetcher(`${OPENAI_BASE}/files`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: formData,
  });
  await assertOk(fileRes, 'file upload');
  const fileJson = (await fileRes.json()) as { id: string };
  const fileId = fileJson.id;

  // 3. Create batch job
  const batchRes = await fetcher(`${OPENAI_BASE}/batches`, {
    method: 'POST',
    headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input_file_id: fileId,
      endpoint: '/v1/embeddings',
      completion_window: '24h',
    }),
  });
  await assertOk(batchRes, 'batch creation');
  const batchJson = (await batchRes.json()) as { id: string };
  return batchJson.id;
}

const TERMINAL_FAILED = new Set(['failed', 'expired', 'cancelled']);

/**
 * Poll the batch status until it completes (or times out / fails).
 * Returns parsed result rows.
 */
export async function pollUntilDone(
  opts: OpenAIBatchClient & { pollIntervalMs?: number; timeoutMs?: number },
  batchId: string,
): Promise<BatchResultRow[]> {
  const {
    apiKey,
    fetch: injectable,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;
  const fetcher = resolveFetch(injectable);
  const deadline = Date.now() + timeoutMs;

  let outputFileId: string | undefined;

  // 1. Poll loop
  while (true) {
    if (Date.now() > deadline) {
      throw new Error(`Batch ${batchId} timed out after ${timeoutMs}ms`);
    }

    const statusRes = await fetcher(`${OPENAI_BASE}/batches/${batchId}`, {
      headers: authHeaders(apiKey),
    });
    await assertOk(statusRes, 'batch status');
    const statusJson = (await statusRes.json()) as {
      id: string;
      status: string;
      output_file_id?: string;
    };

    if (statusJson.status === 'completed') {
      outputFileId = statusJson.output_file_id;
      break;
    }

    if (TERMINAL_FAILED.has(statusJson.status)) {
      throw new Error(`Batch ${batchId} ended with status: ${statusJson.status}`);
    }

    // still in progress — sleep then retry
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  if (!outputFileId) {
    throw new Error(`Batch ${batchId} completed but has no output_file_id`);
  }

  // 2. Download output JSONL
  const contentRes = await fetcher(`${OPENAI_BASE}/files/${outputFileId}/content`, {
    headers: authHeaders(apiKey),
  });
  await assertOk(contentRes, 'file content');
  const rawText = await contentRes.text();

  // 3. Parse each line
  const results: BatchResultRow[] = rawText
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parsed = JSON.parse(line) as {
        custom_id: string;
        response: { body: { data: [{ embedding: number[] }] } };
      };
      return {
        custom_id: parsed.custom_id,
        vector: parsed.response.body.data[0].embedding,
      };
    });

  return results;
}
