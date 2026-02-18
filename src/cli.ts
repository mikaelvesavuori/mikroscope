import { LogQueryService } from "./application/services/LogQueryService.js";

import { LogIndexer } from "./infrastructure/indexing/LogIndexer.js";
import { LogDatabase } from "./infrastructure/persistence/LogDatabase.js";

import type { LogAggregateGroupBy, LogQueryOptions } from "./interfaces/index.js";

import { startMikroScopeServer } from "./server.js";

type ParsedArgs = {
  _: string[];
  [key: string]: string | undefined | string[];
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { _: [] };

  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith("--")) {
      parsed._.push(current);
      continue;
    }

    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }

    parsed[key] = next;
    i++;
  }

  return parsed;
}

function getStringArg(args: ParsedArgs, key: string, fallback: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) return fallback;
  return value;
}

function getNumberArg(args: ParsedArgs, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function getBooleanArg(args: ParsedArgs, key: string, fallback: boolean): boolean {
  const value = args[key];
  if (typeof value !== "string") return fallback;

  const normalized = value.toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

function getOptionalArg(args: ParsedArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getOptionalBooleanArg(args: ParsedArgs, key: string): boolean | undefined {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return undefined;
}

function printHelp(): void {
  process.stdout.write(
    [
      "MikroScope CLI",
      "",
      "Commands:",
      "  serve  Start HTTP/HTTPS API service",
      "  index  Index NDJSON logs into SQLite",
      "  query  Query paginated logs from SQLite",
      "  aggregate  Aggregate indexed logs by level/event/field",
      "",
      "Flags:",
      "  --db     SQLite file path (default: ./data/mikroscope.db)",
      "  --logs   NDJSON log directory (default: ./logs)",
      "  --host   Bind host for `serve` (default: 127.0.0.1)",
      "  --port   Server port for `serve` (default: 4310)",
      "  --https  Enable HTTPS for `serve` (default: false)",
      "  --tls-cert  TLS certificate path (required with --https)",
      "  --tls-key   TLS private key path (required with --https)",
      "  --api-token Bearer token required for /api/* routes (optional)",
      "  --auth-username Basic auth username for /api/* routes (optional)",
      "  --auth-password Basic auth password for /api/* routes (optional)",
      "  --cors-allow-origin CORS allow-list (comma separated origins, default: *)",
      "  --db-retention-days Retain indexed DB rows for N days (default: 30)",
      "  --db-audit-retention-days Retain indexed audit rows for N days (default: 365)",
      "  --log-retention-days Delete raw non-audit .ndjson files older than N days (default: 30)",
      "  --log-audit-retention-days Delete raw audit .ndjson files older than N days (default: 365)",
      "  --audit-backup-dir Copy audit files here before retention delete (optional)",
      "  --maintenance-interval-ms Maintenance cadence in ms (default: 21600000)",
      "  --min-free-bytes Minimum free bytes required for db/log paths (default: 268435456)",
      "  --ingest-interval-ms Incremental ingest cadence in ms (default: 2000)",
      "  --disable-auto-ingest Disable periodic incremental ingest (default: false)",
      "  --ingest-producers Ingest auth map as token=producerId pairs (comma separated)",
      "  --ingest-max-body-bytes Max bytes accepted by /api/ingest payloads (default: 1048576)",
      "  --ingest-async-queue Enable async ingest write/index queue (default: false)",
      "  --ingest-queue-flush-ms Queue flush cadence in ms (default: 25)",
      "  --alert-webhook-url Send alert payloads to this webhook URL (optional)",
      "  --alert-interval-ms Alert evaluation cadence in ms (default: 30000)",
      "  --alert-window-minutes Error threshold lookback window in minutes (default: 5)",
      "  --alert-error-threshold ERROR logs threshold in alert window (default: 20)",
      "  --alert-no-logs-threshold-minutes Trigger alert when no logs in N minutes (default: 0=off)",
      "  --alert-cooldown-ms Min milliseconds between same rule notifications (default: 300000)",
      "  --alert-webhook-timeout-ms Webhook request timeout per attempt (default: 5000)",
      "  --alert-webhook-retry-attempts Max webhook attempts per alert (default: 3)",
      "  --alert-webhook-backoff-ms Base retry backoff in ms (default: 250)",
      "  --from   ISO timestamp lower bound (query)",
      "  --to     ISO timestamp upper bound (query)",
      "  --level  DEBUG|INFO|WARN|ERROR (query)",
      "  --audit  true|false (query)",
      "  --field  Top-level field key (query)",
      "  --value  Top-level field value (query)",
      "  --limit  Max rows (query default: 100, aggregate default: 25)",
      "  --cursor Page cursor token from previous query response",
      "  --group-by level|event|field|correlation (aggregate)",
      "  --group-field Required when --group-by field (aggregate)",
      "",
    ].join("\n"),
  );
}

async function runIndex(args: ParsedArgs): Promise<void> {
  const dbPath = getStringArg(args, "db", "./data/mikroscope.db");
  const logsPath = getStringArg(args, "logs", "./logs");
  const db = new LogDatabase(dbPath);
  const indexer = new LogIndexer(db);

  try {
    const report = await indexer.indexDirectory(logsPath);
    process.stdout.write(`${JSON.stringify({ report }, null, 2)}\n`);
  } finally {
    db.close();
  }
}

async function runQuery(args: ParsedArgs): Promise<void> {
  const dbPath = getStringArg(args, "db", "./data/mikroscope.db");
  const query: LogQueryOptions = {
    audit: getOptionalBooleanArg(args, "audit"),
    cursor: getOptionalArg(args, "cursor"),
    from: getOptionalArg(args, "from"),
    to: getOptionalArg(args, "to"),
    level: getOptionalArg(args, "level"),
    field: getOptionalArg(args, "field"),
    value: getOptionalArg(args, "value"),
    limit: getNumberArg(args, "limit", 100),
  };

  const db = new LogDatabase(dbPath);
  const queryService = new LogQueryService(db);

  try {
    const page = queryService.queryLogsPage(query);
    process.stdout.write(`${JSON.stringify(page, null, 2)}\n`);
  } finally {
    db.close();
  }
}

function parseGroupByArg(value: string | undefined): LogAggregateGroupBy | undefined {
  if (value === "level" || value === "event" || value === "field" || value === "correlation")
    return value;
  return undefined;
}

async function runAggregate(args: ParsedArgs): Promise<void> {
  const dbPath = getStringArg(args, "db", "./data/mikroscope.db");
  const groupBy = parseGroupByArg(getOptionalArg(args, "group-by"));
  if (!groupBy) {
    throw new Error("Missing or invalid --group-by. Use level, event, field, or correlation.");
  }

  const db = new LogDatabase(dbPath);
  const queryService = new LogQueryService(db);

  try {
    const buckets = queryService.aggregateLogs(
      {
        audit: getOptionalBooleanArg(args, "audit"),
        field: getOptionalArg(args, "field"),
        from: getOptionalArg(args, "from"),
        level: getOptionalArg(args, "level"),
        limit: getNumberArg(args, "limit", 25),
        to: getOptionalArg(args, "to"),
        value: getOptionalArg(args, "value"),
      },
      groupBy,
      getOptionalArg(args, "group-field"),
    );
    process.stdout.write(`${JSON.stringify({ buckets, groupBy }, null, 2)}\n`);
  } finally {
    db.close();
  }
}

async function runServe(args: ParsedArgs): Promise<void> {
  const dbPath = getStringArg(args, "db", "./data/mikroscope.db");
  const logsPath = getStringArg(args, "logs", "./logs");
  const host = getStringArg(args, "host", process.env.MIKROSCOPE_HOST || "127.0.0.1");
  const port = getNumberArg(args, "port", 4310);
  const httpsEnabled = getBooleanArg(args, "https", process.env.MIKROSCOPE_HTTPS === "1");
  const protocol = httpsEnabled ? "https" : "http";
  const tlsCertPath = getOptionalArg(args, "tls-cert") || process.env.MIKROSCOPE_TLS_CERT_PATH;
  const tlsKeyPath = getOptionalArg(args, "tls-key") || process.env.MIKROSCOPE_TLS_KEY_PATH;
  const apiToken = getOptionalArg(args, "api-token") || process.env.MIKROSCOPE_API_TOKEN;
  const authUsername =
    getOptionalArg(args, "auth-username") || process.env.MIKROSCOPE_AUTH_USERNAME;
  const authPassword =
    getOptionalArg(args, "auth-password") || process.env.MIKROSCOPE_AUTH_PASSWORD;
  const corsAllowOrigin =
    getOptionalArg(args, "cors-allow-origin") || process.env.MIKROSCOPE_CORS_ALLOW_ORIGIN;
  const dbRetentionDays = getNumberArg(args, "db-retention-days", 30);
  const dbAuditRetentionDays = getNumberArg(args, "db-audit-retention-days", 365);
  const logRetentionDays = getNumberArg(args, "log-retention-days", 30);
  const logAuditRetentionDays = getNumberArg(args, "log-audit-retention-days", 365);
  const auditBackupDirectory =
    getOptionalArg(args, "audit-backup-dir") || process.env.MIKROSCOPE_AUDIT_BACKUP_DIR;
  const maintenanceIntervalMs = getNumberArg(args, "maintenance-interval-ms", 6 * 60 * 60 * 1000);
  const minFreeBytes = getNumberArg(args, "min-free-bytes", 256 * 1024 * 1024);
  const ingestIntervalMs = getNumberArg(args, "ingest-interval-ms", 2_000);
  const disableAutoIngest = getBooleanArg(args, "disable-auto-ingest", false);
  const ingestProducers =
    getOptionalArg(args, "ingest-producers") || process.env.MIKROSCOPE_INGEST_PRODUCERS;
  const ingestMaxBodyBytes = getNumberArg(args, "ingest-max-body-bytes", 1_048_576);
  const ingestAsyncQueue = getBooleanArg(
    args,
    "ingest-async-queue",
    process.env.MIKROSCOPE_INGEST_ASYNC_QUEUE === "1" ||
      process.env.MIKROSCOPE_INGEST_ASYNC_QUEUE === "true",
  );
  const ingestQueueFlushMs = getNumberArg(args, "ingest-queue-flush-ms", 25);
  const alertWebhookUrl =
    getOptionalArg(args, "alert-webhook-url") || process.env.MIKROSCOPE_ALERT_WEBHOOK_URL;
  const alertIntervalMs = getNumberArg(args, "alert-interval-ms", 30_000);
  const alertWindowMinutes = getNumberArg(args, "alert-window-minutes", 5);
  const alertErrorThreshold = getNumberArg(args, "alert-error-threshold", 20);
  const alertNoLogsThresholdMinutes = getNumberArg(args, "alert-no-logs-threshold-minutes", 0);
  const alertCooldownMs = getNumberArg(args, "alert-cooldown-ms", 5 * 60 * 1000);
  const alertWebhookTimeoutMs = getNumberArg(args, "alert-webhook-timeout-ms", 5_000);
  const alertWebhookRetryAttempts = getNumberArg(args, "alert-webhook-retry-attempts", 3);
  const alertWebhookBackoffMs = getNumberArg(args, "alert-webhook-backoff-ms", 250);

  await startMikroScopeServer({
    apiToken,
    authPassword,
    authUsername,
    alertCooldownMs,
    alertErrorThreshold,
    alertIntervalMs,
    alertNoLogsThresholdMinutes,
    alertWebhookUrl,
    alertWebhookBackoffMs,
    alertWebhookRetryAttempts,
    alertWebhookTimeoutMs,
    alertWindowMinutes,
    corsAllowOrigin,
    auditBackupDirectory,
    attachSignalHandlers: true,
    dbPath,
    dbAuditRetentionDays,
    dbRetentionDays,
    host,
    ingestIntervalMs,
    disableAutoIngest,
    ingestProducers,
    ingestMaxBodyBytes,
    ingestAsyncQueue,
    ingestQueueFlushMs,
    logAuditRetentionDays,
    logRetentionDays,
    logsPath,
    maintenanceIntervalMs,
    minFreeBytes,
    port,
    protocol,
    tlsCertPath,
    tlsKeyPath,
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "serve") {
    await runServe(args);
    return;
  }

  if (command === "index") {
    await runIndex(args);
    return;
  }

  if (command === "query") {
    await runQuery(args);
    return;
  }

  if (command === "aggregate") {
    await runAggregate(args);
    return;
  }

  printHelp();
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `[mikroscope] fatal: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exit(1);
});
