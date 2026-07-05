// Raise undici's per-request header/body inactivity timeouts for ALL outbound
// fetch — most importantly LLM provider calls. A slow self-hosted model (a local
// vLLM doing guided-JSON decoding) can hold the connection without sending
// response headers longer than undici's default → UND_ERR_HEADERS_TIMEOUT,
// surfaced as an AI_APICallError that aborts the agent tool. Streaming mitigates
// this (headers arrive with the first token); this is the infra belt-and-braces.
// Imported for side effect near the top of index.ts, before any fetch runs.
import { Agent, setGlobalDispatcher } from 'undici';

const headersTimeout = Number(process.env.LLM_HTTP_HEADERS_TIMEOUT_MS ?? 600_000);
const bodyTimeout = Number(process.env.LLM_HTTP_BODY_TIMEOUT_MS ?? 600_000);

setGlobalDispatcher(new Agent({ headersTimeout, bodyTimeout }));
