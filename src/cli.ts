import {
  resolveMikroScopeServerOptions,
  resolveServerConfigFilePath,
} from "./application/config/resolveMikroScopeServerOptions.js";
import { LogQueryService } from "./application/services/LogQueryService.js";

import { LogIndexer } from "./infrastructure/indexing/LogIndexer.js";
import { LogDatabase } from "./infrastructure/persistence/LogDatabase.js";

import type { LogAggregateGroupBy, LogQueryOptions } from "./interfaces/index.js";

import { type StartMikroScopeServerOptions, startMikroScopeServer } from "./server.js";

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

function getNumberArg(args: ParsedArgs, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function getOptionalArg(args: ParsedArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getOptionalNumberArg(args: ParsedArgs, key: string): number | undefined {
  const value = args[key];
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
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
      "  --config JSON configuration file path (default: ./mikroscope.config.json when present)",
      "  --host   Bind host for `serve` (default: 127.0.0.1)",
      "  --port   Server port for `serve` (default: 4310)",
      "  --protocol http|https for `serve` (default: http)",
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
      "  --alert-config-path Path for persisted alert config JSON (default: <db-dir>/mikroscope.alert-config.json)",
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

function resolveCommandConfig(
  args: ParsedArgs,
  includeLogsPath: boolean,
): Pick<StartMikroScopeServerOptions, "dbPath" | "logsPath"> {
  const configFilePath = resolveServerConfigFilePath(process.argv.slice(2), process.env);
  const resolved = resolveMikroScopeServerOptions({
    configFilePath,
    env: process.env,
    overrides: {
      dbPath: getOptionalArg(args, "db"),
      logsPath: includeLogsPath ? getOptionalArg(args, "logs") : undefined,
    },
  });

  return {
    dbPath: resolved.dbPath,
    logsPath: resolved.logsPath,
  };
}

async function runIndex(args: ParsedArgs): Promise<void> {
  const { dbPath, logsPath } = resolveCommandConfig(args, true);
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
  const { dbPath } = resolveCommandConfig(args, false);
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
  const { dbPath } = resolveCommandConfig(args, false);
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
  const overrides: Partial<StartMikroScopeServerOptions> = {
    apiToken: getOptionalArg(args, "api-token"),
    authPassword: getOptionalArg(args, "auth-password"),
    authUsername: getOptionalArg(args, "auth-username"),
    alertConfigPath: getOptionalArg(args, "alert-config-path"),
    alertCooldownMs: getOptionalNumberArg(args, "alert-cooldown-ms"),
    alertErrorThreshold: getOptionalNumberArg(args, "alert-error-threshold"),
    alertIntervalMs: getOptionalNumberArg(args, "alert-interval-ms"),
    alertNoLogsThresholdMinutes: getOptionalNumberArg(args, "alert-no-logs-threshold-minutes"),
    alertWebhookBackoffMs: getOptionalNumberArg(args, "alert-webhook-backoff-ms"),
    alertWebhookRetryAttempts: getOptionalNumberArg(args, "alert-webhook-retry-attempts"),
    alertWebhookTimeoutMs: getOptionalNumberArg(args, "alert-webhook-timeout-ms"),
    alertWebhookUrl: getOptionalArg(args, "alert-webhook-url"),
    alertWindowMinutes: getOptionalNumberArg(args, "alert-window-minutes"),
    auditBackupDirectory: getOptionalArg(args, "audit-backup-dir"),
    corsAllowOrigin: getOptionalArg(args, "cors-allow-origin"),
    dbAuditRetentionDays: getOptionalNumberArg(args, "db-audit-retention-days"),
    dbPath: getOptionalArg(args, "db"),
    dbRetentionDays: getOptionalNumberArg(args, "db-retention-days"),
    disableAutoIngest: getOptionalBooleanArg(args, "disable-auto-ingest"),
    host: getOptionalArg(args, "host"),
    ingestAsyncQueue: getOptionalBooleanArg(args, "ingest-async-queue"),
    ingestIntervalMs: getOptionalNumberArg(args, "ingest-interval-ms"),
    ingestMaxBodyBytes: getOptionalNumberArg(args, "ingest-max-body-bytes"),
    ingestProducers: getOptionalArg(args, "ingest-producers"),
    ingestQueueFlushMs: getOptionalNumberArg(args, "ingest-queue-flush-ms"),
    logAuditRetentionDays: getOptionalNumberArg(args, "log-audit-retention-days"),
    logsPath: getOptionalArg(args, "logs"),
    logRetentionDays: getOptionalNumberArg(args, "log-retention-days"),
    maintenanceIntervalMs: getOptionalNumberArg(args, "maintenance-interval-ms"),
    minFreeBytes: getOptionalNumberArg(args, "min-free-bytes"),
    port: getOptionalNumberArg(args, "port"),
    tlsCertPath: getOptionalArg(args, "tls-cert"),
    tlsKeyPath: getOptionalArg(args, "tls-key"),
  };

  const protocol = getOptionalArg(args, "protocol");
  if (protocol === "http" || protocol === "https") {
    overrides.protocol = protocol;
  }

  const https = getOptionalBooleanArg(args, "https");
  if (https === true) {
    overrides.protocol = "https";
  } else if (https === false && !overrides.protocol) {
    overrides.protocol = "http";
  }

  const configFilePath = resolveServerConfigFilePath(process.argv.slice(2), process.env);
  const resolved = resolveMikroScopeServerOptions({
    configFilePath,
    env: process.env,
    overrides,
  });
  await startMikroScopeServer(resolved);
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
