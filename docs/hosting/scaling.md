# Scaling Seta

Seta runs as a modular monolith by default — one `seta-server` container with `SETA_MODULES=*`. When one module's resource appetite (CPU, memory, LLM cost) dominates, you can split it into its own process without changing any code. This page explains when, why, and how.

## When to split

Split when:

- My single VPS is RAM-bound and `copilot` is the heavy tenant. → Split `copilot` to a larger box.
- LLM provider spend is concentrated in `copilot` and I want a separate scaling envelope. → Split.
- Background workers for `planner` are starving the HTTP handlers. → Split `planner`.
- Deploys are slow because everything restarts together. → Split.
- I want HA across two hosts. → Split — every module replicates independently.

Don't split when:

- I just feel like it. The monolith is cheaper to operate; don't pay the RPC tax without a reason.
- My traffic is low. Monolith.
- I haven't measured anything yet. Measure first.

## How the split works (concept)

Every module exposes a public-surface type at `packages/<module>/src/index.ts`. Other modules call into it through `createModuleClient('<module>')` from `packages/core/src/rpc/` — a factory that returns an object with the same shape. At process startup, the factory inspects `SETA_MODULES`: if the named module is in the local set, every call is an in-process function call. If it isn't, every call goes over Hono RPC to the URL in `SETA_PEERS_<MODULE>`. Code-side, the caller sees no difference.

Events are unchanged. The Postgres `core.events` outbox is shared across all processes; `LISTEN/NOTIFY` delivers cross-process automatically. Whichever process loads `core` owns the dispatcher and the 2 s fallback poll.

## Env vars for split mode

Full definitions live in [`configuration.md`](configuration.md). Quick reference:

- `SETA_MODULES` — comma-separated module names this process loads.
- `SETA_PEERS_<MODULE>` — base URL for processes that do not load `<MODULE>` (e.g. `SETA_PEERS_PLANNER=https://planner.internal:8080`).
- `SETA_RPC_SHARED_SECRET` — shared bearer secret for self-host single-host split. Production AWS uses mTLS via Private CA instead.
- `SETA_RPC_TIMEOUT_MS` — per-call RPC timeout before `ModuleUnavailable` is thrown.

These four vars land with the dispatch shim (Layer 3). Until the shim is in `.env.example`, leave `SETA_MODULES=*` and run the monolith.

## Self-host split: `compose.split.example.yml`

The repo ships an annotated example file at `compose.split.example.yml` (root) showing a multi-service split wired via Hono RPC over the compose-internal network with `SETA_RPC_SHARED_SECRET` for authentication.

Use it as a layer on top of the default compose:

```bash
docker compose -f compose.yml -f compose.split.example.yml up -d
```

Or copy the relevant service blocks into your own `compose.yml`. Edit each service's `SETA_MODULES` and `SETA_PEERS_*` values, set a strong `SETA_RPC_SHARED_SECRET` in `.env`, and bring it up. Run `migrate` once per service that owns schemas (ordering doesn't matter — see [`upgrading.md`](upgrading.md)).

This is a power-user path. If you don't already understand why you want it, stay on the default monolith.

## AWS split: ECS topology

On AWS, the split topology is implemented as one ECS service per loaded module, with ECS Service Connect for east-west traffic and AWS Private CA for mTLS — no shared bearer secret needed. See [`aws.md`](aws.md) for the diagram; the OpenTofu `examples/split-services/` directory is the executable form.

## Operational concerns when split

- **Bus ownership.** Whichever container loads `core` owns the LISTEN/NOTIFY dispatch and the 2 s fallback poll. Other containers poll their own subscriber tables.
- **Rolling deploys.** ECS rolling update with `minimumHealthyPercent=100`, `maximumPercent=200` — zero-downtime. Self-host compose has no rolling; restart is ≤5 s downtime.
- **HITL approval flows.** Approval cards route through `copilot`. If you split `copilot` off, the approval channel becomes RPC + event; the assistant-ui card UX is unchanged.
- **Observability.** Each split container is its own OTel service — set a distinct `OTEL_SERVICE_NAME` per process so traces are attributable. (This var lands when the dispatch shim does.)

## Cost surfacing

Splitting introduces network failure modes. The dispatch shim defaults: 5 s call timeout, 1 retry with jittered backoff, then `ModuleUnavailable` thrown to the caller. Trace context propagates over the wire (W3C headers); the same spans are produced either way. The cost is not hidden — your error budget for cross-module calls is now non-zero. Plan for it.
