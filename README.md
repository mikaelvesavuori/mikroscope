# MikroScope

**Log sidecar for NDJSON: ingest, query, retention, and alerts.**

MikroScope runs next to your service, writes/reads `.ndjson` logs, indexes them into SQLite, and exposes an HTTP API for search and aggregation.

## What You Get

| Capability | What it does | Why it matters |
| --- | --- | --- |
| Ingest API | Accepts logs over HTTP and writes `.ndjson` files | Lets backend and frontend send logs to one place |
| SQLite index | Continuously indexes raw logs | Fast queries without giving up raw source logs |
| Query + aggregate API | Filter logs and group by level/event/field/correlation | Quick troubleshooting and basic analytics |
| Health + docs endpoints | Runtime health plus OpenAPI/interactive reference | Easier operations and integration |
| Retention + maintenance | Cleans old DB/log records and checks free disk | Keeps long-running deployments stable |
| Webhook alerts | Sends notifications for error spikes or outages | Basic operational alerting without extra tooling |

## Install

| Requirement | Notes |
| --- | --- |
| Node.js `>= 24` | Required to run the release binary/wrapper |
| `curl` or `wget` | Used by installer to download release assets |
| `tar` (or `unzip` for `.zip`) | Needed to extract release archive |

| Method | Recommended for | Command |
| --- | --- | --- |
| One-line installer | Most users | See command below |
| Non-interactive installer | CI/provisioning | See command below |
| Manual release archive | Pinned/manual installs | See "Manual Release Install" below |

Installer behavior:

| Step | Result |
| --- | --- |
| Download latest release | Fetches latest tagged archive from GitHub Releases |
| Verify checksum | Uses `SHA256SUMS.txt` when available |
| Expand archive | Installs binaries/docs under your chosen install directory |
| Prompt for config | Writes host/port/path/auth settings to a local env file |
| Create wrapper | Adds a `mikroscope` command in your chosen bin directory |

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
VERSION=0.1.0
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

2. Send logs from one producer:

```bash
curl -sS "http://127.0.0.1:4310/api/ingest" \
  -H "Authorization: Bearer backend-token" \
  -H "Content-Type: application/json" \
  --data '[{"timestamp":"2026-02-18T10:20:00.000Z","level":"INFO","event":"order.created","message":"Order created","orderId":"ORD-123"}]'
```

3. Query logs:

```bash
curl -sS "http://127.0.0.1:4310/api/logs?field=producerId&value=backend-api&limit=10" \
  -H "Authorization: Bearer api-token-123"
```

4. Open docs and health:

| URL | Purpose |
| --- | --- |
| `http://127.0.0.1:4310/health` | Service health/status payload |
| `http://127.0.0.1:4310/docs` | Interactive API reference (Scalar) |
| `http://127.0.0.1:4310/openapi.json` | OpenAPI 3.1 JSON |
| `http://127.0.0.1:4310/openapi.yaml` | OpenAPI 3.1 YAML |

If `/docs` is blank (for example blocked CDN scripts), use `/openapi.json` directly.

## CLI Commands

| Command | Use case |
| --- | --- |
| `mikroscope serve --logs ./logs --db ./data/mikroscope.db` | Start HTTP/HTTPS API service |
| `mikroscope index --logs ./logs --db ./data/mikroscope.db` | One-time full index from raw logs |
| `mikroscope query --db ./data/mikroscope.db --level ERROR --limit 50` | Query logs from CLI |
| `mikroscope aggregate --db ./data/mikroscope.db --group-by level --limit 10` | Aggregate logs from CLI |

## Auth and `producerId` Model

| Route | Auth options | `producerId` behavior |
| --- | --- | --- |
| `POST /api/ingest` | `Bearer <ingest-token>` mapped by `--ingest-producers`, or Basic auth if configured | Always server-assigned. Incoming `producerId` in payload is ignored/overridden. |
| `GET /api/logs` | `Bearer <api-token>` and/or Basic auth (if enabled) | N/A |
| `GET /api/logs/aggregate` | `Bearer <api-token>` and/or Basic auth (if enabled) | N/A |
| `POST /api/reindex` | `Bearer <api-token>` and/or Basic auth (if enabled) | N/A |

Notes:

| Case | Outcome |
| --- | --- |
| Basic auth is used on ingest | `producerId` becomes the authenticated username |
| `--ingest-producers` is empty and Basic auth is disabled | `/api/ingest` returns `404` (endpoint disabled) |
| Async ingest queue enabled (`--ingest-async-queue`) | Ingest responses return `202` with `queued: true` |

## Ingest Contract

| Item | Value |
| --- | --- |
| Endpoint | `POST /api/ingest` |
| Content type | `application/json` |
| Accepted payload shapes | `[{...}]` or `{ "logs": [{...}] }` |
| Max payload size | Controlled by `--ingest-max-body-bytes` (default `1048576`) |
| Required fields per log | No strict schema at ingest layer; invalid/non-object items are rejected |
| Server-added fields | `producerId`, `ingestedAt` |
| Storage path | `logs/ingest/<producerId>/YYYY-MM-DD.ndjson` |

## API Summary

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | None | Runtime health and policy/status details |
| `POST` | `/api/ingest` | Ingest bearer token mapping or Basic auth | Accept and persist inbound logs |
| `GET` | `/api/logs` | API bearer token and/or Basic auth | Paginated log query |
| `GET` | `/api/logs/aggregate` | API bearer token and/or Basic auth | Bucketed counts |
| `POST` | `/api/reindex` | API bearer token and/or Basic auth | Full DB reset + reindex from logs |
| `GET` | `/openapi.json` | None | OpenAPI 3.1 JSON document |
| `GET` | `/openapi.yaml` | None | OpenAPI 3.1 YAML document |
| `GET` | `/docs` | None | Scalar-rendered interactive API docs |

Query parameters for `/api/logs`:

| Parameter | Type | Description |
| --- | --- | --- |
| `from` | ISO timestamp | Lower bound |
| `to` | ISO timestamp | Upper bound |
| `level` | string | `DEBUG`, `INFO`, `WARN`, `ERROR`, or custom |
| `audit` | boolean | Audit-only filter |
| `field` | string | Top-level JSON field key |
| `value` | string | Top-level JSON field value |
| `limit` | number | Max rows (capped at `1000`) |
| `cursor` | string | Pagination cursor from previous result |

Query parameters for `/api/logs/aggregate`:

| Parameter | Type | Description |
| --- | --- | --- |
| `groupBy` | enum | `level`, `event`, `field`, `correlation` |
| `groupField` | string | Required when `groupBy=field` |
| `from`, `to`, `level`, `audit`, `field`, `value`, `limit` | mixed | Same filtering behavior as `/api/logs` |

## Configuration Reference

### Core and Security

| Flag | Default | Description |
| --- | --- | --- |
| `--logs` | `./logs` | NDJSON root directory |
| `--db` | `./data/mikroscope.db` | SQLite database file |
| `--host` | `127.0.0.1` | Bind host |
| `--port` | `4310` | Bind port |
| `--https` | `false` | Enable HTTPS listener |
| `--tls-cert` | none | TLS certificate path (required with `--https`) |
| `--tls-key` | none | TLS key path (required with `--https`) |
| `--api-token` | none | Bearer token for `/api/*` routes |
| `--auth-username` | none | Basic auth username for `/api/*` |
| `--auth-password` | none | Basic auth password for `/api/*` |
| `--cors-allow-origin` | `*` | CORS allow list (comma-separated origins) |

### Ingest and Indexing

| Flag | Default | Description |
| --- | --- | --- |
| `--ingest-producers` | none | Ingest auth map as `token=producerId` pairs |
| `--ingest-max-body-bytes` | `1048576` | Max ingest request body size |
| `--ingest-interval-ms` | `2000` | Incremental ingest cadence |
| `--disable-auto-ingest` | `false` | Disable periodic incremental ingest |
| `--ingest-async-queue` | `false` | Enable async ingest write/index queue |
| `--ingest-queue-flush-ms` | `25` | Async queue flush cadence |

### Retention and Maintenance

| Flag | Default | Description |
| --- | --- | --- |
| `--db-retention-days` | `30` | Retain non-audit indexed rows for N days |
| `--db-audit-retention-days` | `365` | Retain audit indexed rows for N days |
| `--log-retention-days` | `30` | Retain non-audit raw `.ndjson` files for N days |
| `--log-audit-retention-days` | `365` | Retain audit raw `.ndjson` files for N days |
| `--audit-backup-dir` | none | Optional backup target before deleting audit files |
| `--maintenance-interval-ms` | `21600000` | Maintenance cadence |
| `--min-free-bytes` | `268435456` | Minimum free bytes for DB/log paths |

### Alerting

| Flag | Default | Description |
| --- | --- | --- |
| `--alert-webhook-url` | none | Webhook target for alert payloads |
| `--alert-interval-ms` | `30000` | Alert evaluation cadence |
| `--alert-window-minutes` | `5` | Error threshold lookback window |
| `--alert-error-threshold` | `20` | Error count threshold in alert window |
| `--alert-no-logs-threshold-minutes` | `0` | Alert when no logs for N minutes (`0` disables) |
| `--alert-cooldown-ms` | `300000` | Minimum delay between same-rule notifications |
| `--alert-webhook-timeout-ms` | `5000` | Webhook timeout per request |
| `--alert-webhook-retry-attempts` | `3` | Webhook retry attempts per alert |
| `--alert-webhook-backoff-ms` | `250` | Base backoff between webhook retries |

## Example Integrations

| Producer | Example |
| --- | --- |
| Backend service | `Authorization: Bearer backend-token` mapped to `backend-api` |
| Frontend app | `Authorization: Bearer frontend-token` mapped to `frontend-web` |

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

| File | Purpose |
| --- | --- |
| `/deploy/systemd/mikroscope.service` | Long-running API sidecar |
| `/deploy/systemd/mikroscope-reindex.service` | One-shot full reindex job |
| `/deploy/systemd/mikroscope-reindex.timer` | Scheduled reindex trigger |
| `/deploy/systemd/mikroscope.env.example` | Environment template |

Quick start steps are documented in `/deploy/systemd/README.md`.

## Operations

| Document | Purpose |
| --- | --- |
| `/OPS_RUNBOOK.md` | Health checks, backup policy, restore, incident playbook |
| `/openapi/openapi.yaml` | OpenAPI 3.1 source |
| `/openapi/openapi.json` | OpenAPI 3.1 JSON |

## From Source (Optional)

Use this only if you want to develop MikroScope itself.

```bash
npm install
npm run index
npm run start
```
