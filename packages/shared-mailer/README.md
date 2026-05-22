# @seta/shared-mailer

Transactional email — nodemailer transport, React Email templates, and
an outbox-backed send queue that survives transport outages. Transport
credentials come from the integrations module so tenant-specific SMTP
is supported out of the box.

## Exports

| Entry | Purpose |
|---|---|
| `@seta/shared-mailer` | Public surface — `sendMail()` and template helpers |
| `@seta/shared-mailer/queue` | Outbox-backed send queue, retries, dead-lettering |
| `@seta/shared-mailer/render` | React Email → HTML/text rendering |
| `@seta/shared-mailer/testing` | In-memory transport for tests |

## Scripts

- `pnpm email:preview` — local React Email dev server for template work.
