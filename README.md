# MikroScope

**Ultralight log sidecar for Node.js that turns NDJSON into instant queries and actionable webhook alerts.**

MikroScope runs next to your service, writes/reads `.ndjson` logs, indexes them into SQLite, and exposes an HTTP API for search and aggregation with millisecond latency.

## What You Get

- **Ingest API**: Accepts logs over HTTP and writes `.ndjson` files
  - Lets backend and frontend send logs to one place
- **SQLite index**: Continuously indexes raw logs
  - Fast queries without giving up raw source logs
- **Query + aggregate API**: Filter logs and group by level/event/field/correlation
  - Quick troubleshooting and basic analytics
- **Health + docs endpoints**: Runtime health plus OpenAPI/interactive reference
  - Easier operations and integration
- **Retention + maintenance**: Cleans old DB/log records and checks free disk
  - Keeps long-running deployments stable
- **Webhook alerts**: Sends notifications for error spikes or outages
  - Basic operational alerting without extra tooling

## Install

Requirements:

- Node.js `>= 24` (required to run MikroScope).
- `npm` (required for npm install / npx flows).
- `curl` or `wget` (used by installer to download release assets).
- `tar` (or `unzip` for `.zip`) to extract release archives.

Install methods:

- `npm install -g mikroscope` for persistent CLI usage in Node/npm environments.
- `npx mikroscope --help` for one-off execution without global install.
- One-line installer (below) for VM/server installs without npm dependency.
- Non-interactive installer (below) for CI/provisioning.
- Manual release archive install (see "Manual Release Install" below) for pinned/manual installs.

Installer behavior:

- Download latest release from GitHub Releases.
- Verify checksum using `SHA256SUMS.txt` when available.
- Expand archive into your chosen install directory.
- Prompt for host/port/path/auth config values.
- Create a `mikroscope` wrapper command in your chosen bin directory.

npm install examples:

```bash
# Install once globally
npm install -g mikroscope
mikroscope --help

# Run without installing globally
npx mikroscope --help
```

One-line installer:

```bash
curl -fsSL https://raw.githubusercontent.com/mikaelvesavuori/mikroscope/main/scripts/install.sh | sh
```

Non-interactive installer:

```bash
MIKROSCOPE_INSTALL_NONINTERACTIVE=1 \
MIKROSCOPE_INSTALL_DIR="$HOME/.local/share/mikroscope" \
MIKROSCOPE_BIN_DIR="$HOME/.local/bin" \
curl -fsSL https://raw.githubusercontent.com/mikaelvesavuori/mikroscope/main/scripts/install.sh | sh
```

If `mikroscope` is not found after install, add your chosen bin directory to `PATH` (the installer prints the exact export command).

### Manual Release Install

```bash
VERSION=1.0.0
curl -LO "https://github.com/mikaelvesavuori/mikroscope/releases/download/v${VERSION}/mikroscope-${VERSION}.tar.gz"
curl -LO "https://github.com/mikaelvesavuori/mikroscope/releases/download/v${VERSION}/SHA256SUMS.txt"
shasum -a 256 -c SHA256SUMS.txt
tar -xzf "mikroscope-${VERSION}.tar.gz"
cd "mikroscope-${VERSION}"
./mikroscope serve --host 127.0.0.1 --port 4310 --logs ./logs --db ./data/mikroscope.db
```

## Quick Start

1. Start MikroScope with API auth and ingest producer mappings:

```bash
mikroscope serve \
  --host 127.0.0.1 \
  --port 4310 \
  --logs ./logs \
  --db ./data/mikroscope.db \
  --api-token "api-token-123" \
  --ingest-producers "backend-token=backend-api,frontend-token=frontend-web"
```

1. Send logs from one producer:

```bash
curl -sS "http://127.0.0.1:4310/api/ingest" \
  -H "Authorization: Bearer backend-token" \
  -H "Content-Type: application/json" \
  --data '[{"timestamp":"2026-02-18T10:20:00.000Z","level":"INFO","event":"order.created","message":"Order created","orderId":"ORD-123"}]'
```

1. Query logs:

```bash
curl -sS "http://127.0.0.1:4310/api/logs?field=producerId&value=backend-api&limit=10" \
  -H "Authorization: Bearer api-token-123"
```

1. Open docs and health:

| URL                                  | Purpose                            |
|--------------------------------------|------------------------------------|
| `http://127.0.0.1:4310/health`       | Service health/status payload      |
| `http://127.0.0.1:4310/docs`         | Interactive API reference (Scalar) |
| `http://127.0.0.1:4310/openapi.json` | OpenAPI 3.1 JSON                   |
| `http://127.0.0.1:4310/openapi.yaml` | OpenAPI 3.1 YAML                   |

If `/docs` is blank (for example blocked CDN scripts), use `/openapi.json` directly.

## Configuration Inputs

`mikroscope serve`, `mikroscope index`, `mikroscope query`, and `mikroscope aggregate` resolve configuration with layered precedence:

1. Built-in defaults
1. JSON config file (`--config` or `MIKROSCOPE_CONFIG_PATH`; default: `./mikroscope.config.json` if present)
1. Environment variables (`MIKROSCOPE_*`)
1. Direct CLI flags (highest precedence)

### mikroscope.config.json

MikroScope will automatically read `./mikroscope.config.json` when it exists in your current working directory.

Quick setup:

1. Copy the example template from this repo:

```bash
cp ./examples/mikroscope.config.json ./mikroscope.config.json
```

1. Set your real secrets/tokens in `./mikroscope.config.json`.
1. Start MikroScope:

```bash
mikroscope serve
```

If your config is not in the current directory, set an explicit path:

```bash
mikroscope serve --config /absolute/or/relative/path/mikroscope.config.json
```

Config file keys use camelCase (for example `ingestQueueFlushMs`, `alertErrorThreshold`) and match the server option names.

Template (`./examples/mikroscope.config.json`):

```json
{
  "dbPath": "./data/mikroscope.db",
  "logsPath": "./logs",
  "host": "127.0.0.1",
  "port": 4310,
  "protocol": "http",
  "apiToken": "api-token-123",
  "ingestProducers": "backend-token=backend-api,frontend-token=frontend-web",
  "ingestAsyncQueue": true,
  "alertWebhookUrl": "https://example.com/webhook"
}
```

You can still override config-file values via env vars or CLI flags at runtime.

Use it explicitly:

```bash
mikroscope serve --config ./mikroscope.config.json
```

Env-only example:

```bash
MIKROSCOPE_DB_PATH=./data/mikroscope.db \
MIKROSCOPE_LOGS_PATH=./logs \
MIKROSCOPE_PORT=4310 \
MIKROSCOPE_API_TOKEN=api-token-123 \
mikroscope serve
```

Programmatic usage with direct params:

```ts
import { resolveMikroScopeServerOptions } from "./src/application/config/resolveMikroScopeServerOptions.js";
import { startMikroScopeServer } from "./src/server.js";

const options = resolveMikroScopeServerOptions({
  configFilePath: "./mikroscope.config.json",
  overrides: {
    port: 4320
  }
});

await startMikroScopeServer(options);
```

## Generate Mock Data

If you want realistic logs to inspect quickly, generate synthetic NDJSON files from a source checkout of this repository.

```bash
# Standard dataset (writes to ./logs)
npm run mock-data

# Smaller/faster dataset
npm run mock-data:quick
```

What this does:

- Writes normal logs to `./logs/generated/*.ndjson`.
- Writes audit logs to `./logs/audit/generated/*.ndjson`.
- Uses deterministic random data (seeded) so runs are reproducible.

Useful tuning options:

- `MOCK_LOG_DAYS` (default: `21`)
- `MOCK_LOGS_PER_DAY` (default: `1200`)
- `MOCK_AUDIT_LOGS_PER_DAY` (default: `150`)
- `MOCK_LOG_TENANTS` (default: `320`)
- `MOCK_LOG_SEED` (default: `2602`)
- `MOCK_LOG_OUT_DIR` (default: `./logs`)

Example custom run:

```bash
MOCK_LOG_DAYS=14 \
MOCK_LOGS_PER_DAY=800 \
MOCK_AUDIT_LOGS_PER_DAY=100 \
MOCK_LOG_TENANTS=120 \
npm run mock-data
```

Then index and run:

```bash
npm run index
npm start
```

## Optional UI: MikroScope Console

MikroScope works with the optional [MikroScope Console](https://github.com/mikaelvesavuori/mikroscope-console), a static web UI for exploring logs and correlations.

Basic setup:

1. Start MikroScope:

```bash
mikroscope serve --host 127.0.0.1 --port 4310 --logs ./logs --db ./data/mikroscope.db --cors-allow-origin http://127.0.0.1:4320
```

1. Install Console (from the console repo README):

```bash
curl -fsSL https://raw.githubusercontent.com/mikaelvesavuori/mikroscope-console/main/install.sh -o install.sh && sh install.sh && rm install.sh
```

1. Set Console API target in `public/config.json`:

```json
{
  "apiOrigin": "http://127.0.0.1:4310"
}
```

1. Serve Console static files and open it:

```bash
npx http-server public -p 4320 -c-1
```

MikroScope endpoints used by Console:

- `GET /health`
- `GET /api/logs`
- `GET /api/logs/aggregate`
- `GET /api/alerts/config`
- `PUT /api/alerts/config`
- `POST /api/alerts/test-webhook`

## Manual Webhook Alert Demo

If you want to manually experience alerting (not test runner output), use the helper script:

```bash
# Start demo in error-threshold mode
npm run demo:alerts -- up error

# Trigger ERROR logs (should fire webhook)
npm run demo:alerts -- trigger-error

# Check alerting state from /health
npm run demo:alerts -- status

# Inspect recent webhook + server logs
npm run demo:alerts -- logs

# Stop demo
npm run demo:alerts -- down
```

No-logs mode:

```bash
npm run demo:alerts -- up nologs
```

Then wait ~60-70 seconds without sending logs and check `npm run demo:alerts -- logs` for a `rule: "no_logs"` webhook.

## Remote Alert Configuration

Alert config can be managed over API and is persisted to disk so it survives restarts/reboots.

Default config file path:

- `<db-directory>/mikroscope.alert-config.json`

Override path:

- CLI: `--alert-config-path /path/to/mikroscope.alert-config.json`
- Env: `MIKROSCOPE_ALERT_CONFIG_PATH=/path/to/mikroscope.alert-config.json`

Examples:

```bash
# Read current policy
curl -sS "http://127.0.0.1:4310/api/alerts/config" \
  -H "Authorization: Bearer api-token-123"

# Update and persist policy
curl -sS "http://127.0.0.1:4310/api/alerts/config" \
  -H "Authorization: Bearer api-token-123" \
  -H "Content-Type: application/json" \
  -X PUT \
  --data '{
    "enabled": true,
    "webhookUrl": "https://example.com/webhook",
    "intervalMs": 30000,
    "windowMinutes": 5,
    "errorThreshold": 20,
    "noLogsThresholdMinutes": 0,
    "cooldownMs": 300000,
    "webhookTimeoutMs": 5000,
    "webhookRetryAttempts": 3,
    "webhookBackoffMs": 250
  }'

# Send a manual test webhook event
curl -sS "http://127.0.0.1:4310/api/alerts/test-webhook" \
  -H "Authorization: Bearer api-token-123" \
  -H "Content-Type: application/json" \
  -X POST \
  --data '{}'
```

## CLI Commands

| Command                                                                      | Use case                          |
|------------------------------------------------------------------------------|-----------------------------------|
| `mikroscope serve --logs ./logs --db ./data/mikroscope.db`                   | Start HTTP/HTTPS API service      |
| `mikroscope index --logs ./logs --db ./data/mikroscope.db`                   | One-time full index from raw logs |
| `mikroscope query --db ./data/mikroscope.db --level ERROR --limit 50`        | Query logs from CLI               |
| `mikroscope aggregate --db ./data/mikroscope.db --group-by level --limit 10` | Aggregate logs from CLI           |

## Auth and `producerId` Model

| Route                     | Auth options                                                                        | `producerId` behavior                                                           |
|---------------------------|-------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `POST /api/ingest`        | `Bearer <ingest-token>` mapped by `--ingest-producers`, or Basic auth if configured | Always server-assigned. Incoming `producerId` in payload is ignored/overridden. |
| `GET /api/logs`           | `Bearer <api-token>` and/or Basic auth (if enabled)                                 | N/A                                                                             |
| `GET /api/logs/aggregate` | `Bearer <api-token>` and/or Basic auth (if enabled)                                 | N/A                                                                             |
| `GET /api/alerts/config`  | `Bearer <api-token>` and/or Basic auth (if enabled)                                 | N/A                                                                             |
| `PUT /api/alerts/config`  | `Bearer <api-token>` and/or Basic auth (if enabled)                                 | N/A                                                                             |
| `POST /api/alerts/test-webhook` | `Bearer <api-token>` and/or Basic auth (if enabled)                          | N/A                                                                             |
| `POST /api/reindex`       | `Bearer <api-token>` and/or Basic auth (if enabled)                                 | N/A                                                                             |

Notes:

| Case                                                     | Outcome                                           |
|----------------------------------------------------------|---------------------------------------------------|
| Basic auth is used on ingest                             | `producerId` becomes the authenticated username   |
| `--ingest-producers` is empty and Basic auth is disabled | `/api/ingest` returns `404` (endpoint disabled)   |
| Async ingest queue enabled (`--ingest-async-queue`)      | Ingest responses return `202` with `queued: true` |

## Ingest Contract

| Item                    | Value                                                                   |
|-------------------------|-------------------------------------------------------------------------|
| Endpoint                | `POST /api/ingest`                                                      |
| Content type            | `application/json`                                                      |
| Accepted payload shapes | `[{...}]` or `{ "logs": [{...}] }`                                      |
| Max payload size        | Controlled by `--ingest-max-body-bytes` (default `1048576`)             |
| Required fields per log | No strict schema at ingest layer; invalid/non-object items are rejected |
| Server-added fields     | `producerId`, `ingestedAt`                                              |
| Storage path            | `logs/ingest/<producerId>/YYYY-MM-DD.ndjson`                            |

## API Summary

| Method | Path                  | Auth                                      | Purpose                                  |
|--------|-----------------------|-------------------------------------------|------------------------------------------|
| `GET`  | `/health`             | None                                      | Runtime health and policy/status details |
| `POST` | `/api/ingest`         | Ingest bearer token mapping or Basic auth | Accept and persist inbound logs          |
| `GET`  | `/api/alerts/config`  | API bearer token and/or Basic auth        | Read active alert policy + config path   |
| `PUT`  | `/api/alerts/config`  | API bearer token and/or Basic auth        | Update and persist alert policy          |
| `POST` | `/api/alerts/test-webhook` | API bearer token and/or Basic auth   | Send manual webhook test event           |
| `GET`  | `/api/logs`           | API bearer token and/or Basic auth        | Paginated log query                      |
| `GET`  | `/api/logs/aggregate` | API bearer token and/or Basic auth        | Bucketed counts                          |
| `POST` | `/api/reindex`        | API bearer token and/or Basic auth        | Full DB reset + reindex from logs        |
| `GET`  | `/openapi.json`       | None                                      | OpenAPI 3.1 JSON document                |
| `GET`  | `/openapi.yaml`       | None                                      | OpenAPI 3.1 YAML document                |
| `GET`  | `/docs`               | None                                      | Scalar-rendered interactive API docs     |

Query parameters for `/api/logs`:

| Parameter | Type          | Description                                 |
|-----------|---------------|---------------------------------------------|
| `from`    | ISO timestamp | Lower bound                                 |
| `to`      | ISO timestamp | Upper bound                                 |
| `level`   | string        | `DEBUG`, `INFO`, `WARN`, `ERROR`, or custom |
| `audit`   | boolean       | Audit-only filter                           |
| `field`   | string        | Top-level JSON field key                    |
| `value`   | string        | Top-level JSON field value                  |
| `limit`   | number        | Max rows (capped at `1000`)                 |
| `cursor`  | string        | Pagination cursor from previous result      |

Query parameters for `/api/logs/aggregate`:

| Parameter                                                 | Type   | Description                              |
|-----------------------------------------------------------|--------|------------------------------------------|
| `groupBy`                                                 | enum   | `level`, `event`, `field`, `correlation` |
| `groupField`                                              | string | Required when `groupBy=field`            |
| `from`, `to`, `level`, `audit`, `field`, `value`, `limit` | mixed  | Same filtering behavior as `/api/logs`   |

## Configuration Reference

### Core and Security

| Flag                  | Default                | Description                                    |
|-----------------------|------------------------|------------------------------------------------|
| `--logs`              | `./logs`               | NDJSON root directory                          |
| `--db`                | `./data/mikroscope.db` | SQLite database file                           |
| `--config`            | `./mikroscope.config.json` | JSON config file path (if present)         |
| `--host`              | `127.0.0.1`            | Bind host                                      |
| `--port`              | `4310`                 | Bind port                                      |
| `--protocol`          | `http`                 | Listener protocol (`http` or `https`)          |
| `--https`             | `false`                | Enable HTTPS listener                          |
| `--tls-cert`          | none                   | TLS certificate path (required with `--https`) |
| `--tls-key`           | none                   | TLS key path (required with `--https`)         |
| `--api-token`         | none                   | Bearer token for `/api/*` routes               |
| `--auth-username`     | none                   | Basic auth username for `/api/*`               |
| `--auth-password`     | none                   | Basic auth password for `/api/*`               |
| `--cors-allow-origin` | `*`                    | CORS allow list (comma-separated origins)      |

### Ingest and Indexing

| Flag                      | Default   | Description                                 |
|---------------------------|-----------|---------------------------------------------|
| `--ingest-producers`      | none      | Ingest auth map as `token=producerId` pairs |
| `--ingest-max-body-bytes` | `1048576` | Max ingest request body size                |
| `--ingest-interval-ms`    | `2000`    | Incremental ingest cadence                  |
| `--disable-auto-ingest`   | `false`   | Disable periodic incremental ingest         |
| `--ingest-async-queue`    | `false`   | Enable async ingest write/index queue       |
| `--ingest-queue-flush-ms` | `25`      | Async queue flush cadence                   |

### Retention and Maintenance

| Flag                         | Default     | Description                                        |
|------------------------------|-------------|----------------------------------------------------|
| `--db-retention-days`        | `30`        | Retain non-audit indexed rows for N days           |
| `--db-audit-retention-days`  | `365`       | Retain audit indexed rows for N days               |
| `--log-retention-days`       | `30`        | Retain non-audit raw `.ndjson` files for N days    |
| `--log-audit-retention-days` | `365`       | Retain audit raw `.ndjson` files for N days        |
| `--audit-backup-dir`         | none        | Optional backup target before deleting audit files |
| `--maintenance-interval-ms`  | `21600000`  | Maintenance cadence                                |
| `--min-free-bytes`           | `268435456` | Minimum free bytes for DB/log paths                |

### Alerting

| Flag                                | Default  | Description                                     |
|-------------------------------------|----------|-------------------------------------------------|
| `--alert-webhook-url`               | none     | Webhook target for alert payloads               |
| `--alert-interval-ms`               | `30000`  | Alert evaluation cadence                        |
| `--alert-window-minutes`            | `5`      | Error threshold lookback window                 |
| `--alert-error-threshold`           | `20`     | Error count threshold in alert window           |
| `--alert-no-logs-threshold-minutes` | `0`      | Alert when no logs for N minutes (`0` disables) |
| `--alert-cooldown-ms`               | `300000` | Minimum delay between same-rule notifications   |
| `--alert-webhook-timeout-ms`        | `5000`   | Webhook timeout per request                     |
| `--alert-webhook-retry-attempts`    | `3`      | Webhook retry attempts per alert                |
| `--alert-webhook-backoff-ms`        | `250`    | Base backoff between webhook retries            |
| `--alert-config-path`               | db dir   | Path to persisted alert config JSON             |

## Example Integrations

| Producer        | Example                                                         |
|-----------------|-----------------------------------------------------------------|
| Backend service | `Authorization: Bearer backend-token` mapped to `backend-api`   |
| Frontend app    | `Authorization: Bearer frontend-token` mapped to `frontend-web` |

Backend example:

```ts
await fetch("http://127.0.0.1:4310/api/ingest", {
  method: "POST",
  headers: {
    authorization: "Bearer backend-token",
    "content-type": "application/json",
  },
  body: JSON.stringify([
    {
      timestamp: new Date().toISOString(),
      level: "INFO",
      event: "order.created",
      message: "Order created",
      orderId: "ORD-123",
    },
  ]),
});
```

Frontend example:

```ts
await fetch("http://127.0.0.1:4310/api/ingest", {
  method: "POST",
  headers: {
    authorization: "Bearer frontend-token",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    logs: [
      {
        timestamp: new Date().toISOString(),
        level: "INFO",
        event: "ui.click",
        message: "Checkout clicked",
        route: "/checkout",
      },
    ],
  }),
});
```

## VM Deployment (systemd)

Prepared units are in `/deploy/systemd`:

| File                                         | Purpose                   |
|----------------------------------------------|---------------------------|
| `/deploy/systemd/mikroscope.service`         | Long-running API sidecar  |
| `/deploy/systemd/mikroscope-reindex.service` | One-shot full reindex job |
| `/deploy/systemd/mikroscope-reindex.timer`   | Scheduled reindex trigger |
| `/deploy/systemd/mikroscope.env.example`     | Environment template      |

Quick start steps are documented in `/deploy/systemd/README.md`.

## Operations

| Document                | Purpose                                                  |
|-------------------------|----------------------------------------------------------|
| `/OPS_RUNBOOK.md`       | Health checks, backup policy, restore, incident playbook |
| `/openapi/openapi.yaml` | OpenAPI 3.1 source                                       |
| `/openapi/openapi.json` | OpenAPI 3.1 JSON                                         |

## From Source (Optional)

Use this only if you want to develop MikroScope itself.

```bash
npm install
npm run index
npm start
```
