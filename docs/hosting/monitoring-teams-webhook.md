# Alert delivery: the MS Teams webhook (`TEAMS_WEBHOOK_URL`)

Alertmanager sends alerts to Microsoft Teams via `msteamsv2_configs`, which posts an
Adaptive Card to a **Power Automate Workflow** webhook. (Microsoft retired the old
"Office 365 Connector" incoming webhooks; Workflows is the supported replacement.)
`TEAMS_WEBHOOK_URL` is that Workflow's HTTP POST URL.

## Create the webhook

Pick the template that matches where you want alerts posted:

- **Group chat (or 1:1 chat):** "Post to a chat when a webhook request is received".
- **Channel:** "Post to a channel when a webhook request is received".

Steps (group chat shown; the channel flow is identical bar the last selection):

1. In Teams: **Apps → Workflows → Create** (or open the target group chat →
   **⋯ (more options) → Workflows**).
2. Choose **"Post to a chat when a webhook request is received"**.
3. Confirm the connection (sign in), then **Next**.
4. For **"Post in"** select **Group chat**, then pick the existing group chat to post
   to. (You must be a member of that chat.)
5. **Create**. Copy the generated **HTTP POST URL** — that is `TEAMS_WEBHOOK_URL`.

Treat the URL as a secret: anyone holding it can post to the chat. To rotate, delete
the workflow and create a new one. Exact labels shift as Microsoft updates the UI; the
constant is the "Post to a chat … when a webhook request is received" trigger.

## Install it

The URL lives as a file secret mounted into Alertmanager at
`/etc/alertmanager/secrets/teams_webhook_url` (never committed). Two ways to set it:

**A — via the deploy workflow (preferred).** Add `TEAMS_WEBHOOK_URL` to the GitHub
**`monitoring`** Environment secrets, then run the **Deploy Monitoring** workflow —
it writes the value into the `seta-monitoring-alertmanager-secrets` volume and brings
the stack up.

**B — directly on the box** (one-off / no redeploy):

```bash
printf '%s' '<PASTE_WEBHOOK_URL>' | docker run --rm -i \
  -v seta-monitoring-alertmanager-secrets:/s busybox \
  sh -c 'cat > /s/teams_webhook_url'
docker restart seta-monitoring-alertmanager-1
```

## Verify

Alertmanager always fires a `Watchdog` alert (routed on a short interval), so within a
few minutes of a valid webhook a heartbeat card appears in the target chat. To force one:

```bash
# on the box — send a synthetic alert through Alertmanager
docker exec seta-monitoring-alertmanager-1 amtool alert add \
  alertname=WebhookTest severity=warning env=uat --alertmanager.url=http://localhost:9093
```

If nothing arrives, check `docker logs seta-monitoring-alertmanager-1` — a `401`/`404`
means a wrong or expired URL; an empty secret file means it was never written.
