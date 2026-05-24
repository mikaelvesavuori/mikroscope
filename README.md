# MikroScope

**The minimalist log sidecar that's all yours.**

![MikroScope product view](./mikroscope.png)

MikroScope is an ultralight log sidecar for Node.js services. It ingests NDJSON logs, indexes them into SQLite, exposes fast query and aggregation APIs, and sends webhook alerts when something needs attention.

## Related Mikro Tool

MikroScope helps you inspect logs and events after something happens. Pair it with [MikroAPM](https://mikrosuite.com/apm) when you also want uptime checks, alerts, and a public status dashboard.

## Features

- **Batteries included** - ingest, indexing, query, aggregation, health, docs, and alerting in one service
- **NDJSON source logs** so raw records stay portable
- **SQLite index** for fast local search and aggregation
- **HTTP ingest API** for backend and frontend producers
- **Query API** with filters for producer, level, audit, fields, timestamps, and cursors
- **Aggregate API** for level, event, component, and correlation buckets
- **OpenAPI docs** through JSON, YAML, and an interactive reference
- **Webhook alerts** for error spikes and operational failures
- **Retention and maintenance** for long-running deployments
- **Layered configuration** through defaults, JSON config, environment variables, and CLI flags

## Quick Start

### Install the Logging Sidecar

```bash
npm install -g mikroscope
```

### Start the server

```bash
mikroscope serve \
  --host 127.0.0.1 \
  --port 3000 \
  --logs ./logs \
  --db ./data/mikroscope.db \
  --api-token "api-token-123" \
  --ingest-producers "backend-token=backend-api,frontend-token=frontend-web"
```

### Send logs

```bash
curl -sS "http://127.0.0.1:3000/api/ingest" \
  -H "Authorization: Bearer backend-token" \
  -H "Content-Type: application/json" \
  --data '[{"timestamp":"2026-02-18T10:20:00.000Z","level":"INFO","event":"order.created","message":"Order created","orderId":"ORD-123"}]'
```

### Query logs

```bash
curl -sS "http://127.0.0.1:3000/api/logs?field=producerId&value=backend-api&limit=10" \
  -H "Authorization: Bearer api-token-123"
```

Open:

- `http://127.0.0.1:3000/health` - service health
- `http://127.0.0.1:3000/docs` - interactive API reference
- `http://127.0.0.1:3000/openapi.json` - OpenAPI 3.1 JSON
- `http://127.0.0.1:3000/openapi.yaml` - OpenAPI 3.1 YAML

The npm package is the primary distribution for running the MikroScope API/logging sidecar. Release ZIPs are provided for pinned deployments and static console hosting.

## Configuration

MikroScope resolves configuration in this order:

1. Built-in defaults
2. JSON config file
3. `MIKROSCOPE_*` environment variables
4. CLI flags

Copy the example config:

```bash
cp ./examples/mikroscope.config.json ./mikroscope.config.json
mikroscope serve --config ./mikroscope.config.json
```

Useful settings include:

- `dbPath` - SQLite database path
- `logsPath` - NDJSON log directory
- `host` and `port` - server bind address
- `apiToken` - token for query/admin API access
- `ingestProducers` - token-to-producer mapping for ingestion
- `alertWebhookUrl` - webhook target for alerts

## Static Console

The API process does not serve the browser console. Download and serve the static app bundle separately when you want a web UI:

```bash
curl -sSL -o mikroscope_app.zip https://releases.mikrosuite.com/mikroscope_app_latest.zip
unzip mikroscope_app.zip -d mikroscope_app
cd mikroscope_app/*
npx http-server . -a 127.0.0.1 -p 8000 -c-1
```

The console reads `config.json` and sends API requests to the configured `apiOrigin`.

## Release Downloads

The latest release archives are available from GitHub Releases and these stable URLs. Use them when you need pinned deployable ZIPs rather than the npm CLI package:

- `https://releases.mikrosuite.com/mikroscope_api_latest.zip` - Node API and CLI bundle
- `https://releases.mikrosuite.com/mikroscope_app_latest.zip` - static browser console

## Technology

- **Runtime**: Node.js
- **Storage**: NDJSON files plus SQLite index
- **API**: HTTP server with OpenAPI 3.1 contract
- **Config**: MikroConf and layered runtime inputs
- **Alerts**: Webhook notifications
- **Distribution**: npm CLI package plus prebuilt app and API release archives

## License

MIT. See the [LICENSE](LICENSE) file.
