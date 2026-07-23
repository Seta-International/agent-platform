# Developer usage telemetry

Claude Code on each developer machine reports **usage metadata** to the central monitoring
stack, so we can see what AI tooling costs, who has adopted it, and where it helps. This
page is the whole story: what leaves your machine, what does not, and how to turn it off.

Set up by [`scripts/dev/telemetry-bootstrap.mjs`](../../scripts/dev/telemetry-bootstrap.mjs),
which runs from `postinstall` on macOS, Ubuntu and Windows.

## What is collected

Metrics — `claude_code.token.usage`, `claude_code.cost.usage`, `claude_code.active_time.total`,
`claude_code.session.count`, plus tool, hook and MCP-connection events. Each carries the
model, the token type, and these resource attributes:

| Attribute | Source |
|---|---|
| `dev.email` | `git config user.email` |
| `dev.os_user` | OS account name |

Claude Code also emits `user_email`, `user_id` and `user_account_uuid` natively, but **we
share one Claude login**, so those are identical for everyone and cannot tell people apart.
`dev.email` from git config is the only per-person identity available on the machine, and
it is self-declared rather than authenticated — good enough for cost and adoption trends,
not evidence about an individual.

The metrics carry no repository or branch label. `OTEL_RESOURCE_ATTRIBUTES` is the only
channel for custom labels and a higher-precedence settings file *replaces* it instead of
merging, so a per-repo label would overwrite the identity above. Claude Code emits no cwd,
repo or branch of its own — verified against a live payload. Attribution is therefore per
developer, not per project.

## What is not collected

**No content of any kind.** All five content-capture switches are written explicitly as
`0` rather than left at their defaults, so the boundary is visible in the settings file and
an upstream default change cannot silently start shipping text:

`OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_ASSISTANT_RESPONSES`, `OTEL_LOG_TOOL_CONTENT`,
`OTEL_LOG_TOOL_DETAILS`, `OTEL_LOG_RAW_API_BODIES`

That means no prompts, no model replies, no file contents, no diffs, no command output.
This is deliberate and not merely a default: prompts in this repo routinely contain
candidate PII and local `.env` values, and a metrics pipeline is the wrong place for either.

Verified by sending a unique phrase through a real session and confirming it was absent
from the captured OTLP payloads; the payload size was byte-identical across prompts of
different lengths. Re-run that check if the exporter is ever reconfigured.

## Where the settings live

Everything lives in `~/.claude/settings.json`, so it covers every repository on the machine
as well as Claude Code sessions inside Claude Desktop. Nothing is written into any repo.

Claude Desktop's plain chat is not covered — it runs server-side and exposes no local hook.
Only its Claude Code sessions report.

## Why cumulative temporality

`OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=cumulative` is not optional. Claude Code
defaults to delta, which Prometheus rejects with "invalid temporality and type combination"
— while still answering `200`. Every metric would disappear with no error anywhere.

## Check what your machine sends

```bash
pnpm telemetry:status
```

## Opt out

```bash
SETA_TELEMETRY_OPTOUT=1 pnpm install
```

This removes every key the script owns and leaves the rest of your settings untouched.

## Setup

The bootstrap needs `SETA_TELEMETRY_TOKEN` — the base64 `user:password` for the ingest
proxy, shared by the team. Without it the script configures nothing rather than leaving a
broken exporter retrying against a 401. It also does nothing when `CI` is set.

The credential is shared and write-only, so **`dev.email` is a self-declared label, not an
authenticated identity.** Treat the data as good enough for cost and adoption trends, and
not as evidence about any individual.

## Ingest path

```
dev machine ──OTLP/http──▶ future-ingest.seta-international.com  (Traefik TLS)
                              └─▶ monitoring-ingest (nginx, basic auth)
                                    ├─ /v1/metrics ─▶ Prometheus  (--web.enable-otlp-receiver)
                                    └─ /v1/logs    ─▶ Loki        (/otlp/v1/logs)
```
