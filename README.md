# MikroScope

MikroScope is a lightweight log sidecar for Node.js.

It ingests `*.ndjson` logs, indexes them in [Node.js-native SQLite](https://nodejs.org/api/sqlite.html), and provides:

- Local HTTP API for querying and aggregating logs
- Incremental ingest and retention maintenance
- Optional webhook alerting

## Purpose

MikroScope keeps observability concerns separate from application runtime:

- Application writes logs
- MikroScope owns indexing, querying, retention, and alert checks

## Installation

Prerequisites:

- Node.js `>= 24`

From repository root:

```bash
npm install
```

## Quick Start

From repository root:

```bash
# One-time full index
npm run mikroscope:index

# Start API server on http://127.0.0.1:4310
npm run mikroscope:serve
```

Useful helpers:

```bash
# Query from CLI
npm run mikroscope:query -- --level ERROR --limit 50

# Run MikroScope + console together
npm run mikroscope:dev
```

## Usage

Main CLI commands:

- `serve`: run the sidecar HTTP/HTTPS API
- `index`: perform full index over log files
- `query`: fetch paginated log entries from SQLite
- `aggregate`: grouped counts by `level`, `event`, `field`, or `correlation`

Examples:

```bash
# Serve with API token protection
tsx mikroscope/src/cli.ts serve --host 127.0.0.1 --port 4310 --api-token your-token

# Query by field
tsx mikroscope/src/cli.ts query --db ./data/mikroscope.db --field customerId --value CUST-42 --limit 100

# Aggregate by correlation
tsx mikroscope/src/cli.ts aggregate --db ./data/mikroscope.db --group-by correlation --limit 50
```

## Configuration

You can configure via CLI flags or environment variables.

Core:

- `--logs` default `./logs`
- `--db` default `./data/mikroscope.db`
- `--host` default `127.0.0.1`
- `--port` default `4310`

Security/network:

- `--api-token` / `MIKROSCOPE_API_TOKEN` (protects `/api/*`)
- `--auth-username` / `MIKROSCOPE_AUTH_USERNAME` and `--auth-password` / `MIKROSCOPE_AUTH_PASSWORD` for Basic Auth on `/api/*`
- `--cors-allow-origin` / `MIKROSCOPE_CORS_ALLOW_ORIGIN`
- `--https`, `--tls-cert`, `--tls-key` for native HTTPS

Ingest and maintenance:

- `--ingest-interval-ms` / `MIKROSCOPE_INGEST_INTERVAL_MS` (default `2000`)
- `--disable-auto-ingest` / `MIKROSCOPE_DISABLE_AUTO_INGEST`
- `--ingest-producers` / `MIKROSCOPE_INGEST_PRODUCERS` as `token=producerId` pairs (comma separated)
- `--ingest-max-body-bytes` / `MIKROSCOPE_INGEST_MAX_BODY_BYTES` (default `1048576`)
- `--ingest-async-queue` / `MIKROSCOPE_INGEST_ASYNC_QUEUE` (default `false`)
- `--ingest-queue-flush-ms` / `MIKROSCOPE_INGEST_QUEUE_FLUSH_MS` (default `25`)
- retention flags (`--db-retention-days`, `--log-retention-days`, audit equivalents)
- `--maintenance-interval-ms`, `--min-free-bytes`
- `--audit-backup-dir` / `MIKROSCOPE_AUDIT_BACKUP_DIR`

Alerting:

- `--alert-webhook-url` / `MIKROSCOPE_ALERT_WEBHOOK_URL`
- `--alert-interval-ms`, `--alert-window-minutes`, `--alert-error-threshold`
- `--alert-no-logs-threshold-minutes`, `--alert-cooldown-ms`
- `--alert-webhook-timeout-ms`, `--alert-webhook-retry-attempts`, `--alert-webhook-backoff-ms`

Reference defaults are visible in:

- `mikroscope/src/cli.ts`
- `.env.example`

## HTTP API

OpenAPI 3.1 specification:

- `openapi/openapi.yaml`
- `openapi/openapi.json`
- `GET /openapi.yaml` serves this specification at runtime
- `GET /openapi.json` serves this specification as JSON at runtime
- `GET /docs` (or `/docs/`) serves Scalar API Reference backed by `/openapi.json`

`GET /health`

- service/maintenance/ingest/alert/storage status
- no auth required

`GET /api/logs`

- paginated log query response: `{ entries, hasMore, limit, nextCursor? }`
- params: `from`, `to`, `level`, `audit`, `field`, `value`, `limit`, `cursor`
- `limit` is capped at `1000`

`GET /api/logs/aggregate`

- grouped counts: `{ buckets, groupBy, groupField }`
- params: `groupBy=level|event|field|correlation`, optional filters from `/api/logs`
- `groupField` required when `groupBy=field`
- `limit` is capped at `1000`

`POST /api/ingest`

- requires auth via either:
- `Authorization: Basic <base64(username:password)>` when Basic Auth is configured
- `Authorization: Bearer <token>` where token is configured in `--ingest-producers`
- accepts either an array of logs (`[ ... ]`) or `{ "logs": [ ... ] }`
- writes accepted logs to `.ndjson` under `logs/ingest/<producerId>/YYYY-MM-DD.ndjson`
- `producerId` is always set from auth identity; any incoming `producerId` in payload is overridden
- with Basic Auth, `producerId` is set to authenticated username
- returns `200` by default, or `202` with `{ queued: true }` when `--ingest-async-queue` is enabled

`POST /api/reindex`

- full reindex with DB reset + incremental cursor reset
- response includes `{ report, reset }`

Example:

```bash
curl -sS "http://127.0.0.1:4310/api/logs?level=ERROR&limit=100" \
  -H "Authorization: Bearer $MIKROSCOPE_API_TOKEN"

curl -sS "http://127.0.0.1:4310/api/ingest" \
  -H "Authorization: Bearer $MIKROSCOPE_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  --data '[{"timestamp":"2026-02-18T10:20:00.000Z","level":"INFO","event":"frontend.click","message":"click"}]'
```

## Deployment Example (systemd)

Minimal service example:

```ini
[Unit]
Description=MikroScope
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/my-app
ExecStart=/usr/bin/env tsx mikroscope/src/cli.ts serve --host 127.0.0.1 --port 4310 --logs /srv/my-app/logs --db /srv/my-app/data/mikroscope.db
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

For public exposure, place MikroScope behind a reverse proxy and TLS terminator (for example Caddy).

## Operations

Backup/restore and incident procedures:

- `mikroscope/OPS_RUNBOOK.md`

## Next

- [ ] Systemd jobs/services to get this started quickly on e.g. a VM
- [ ] Example integrations/get started

## Related

Console UI:

- `mikroscope-console/README.md`
