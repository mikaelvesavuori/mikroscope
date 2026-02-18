import {
  copyFileSync,
  type Dirent,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { Server as HttpServer } from "node:http";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  createServer as createHttpsServer,
  type Server as HttpsServer,
  type ServerOptions as HttpsServerOptions,
} from "node:https";
import type { AddressInfo } from "node:net";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { LogQueryService } from "./application/services/LogQueryService.js";
import {
  json,
  parseAllowedOrigins,
  readJsonBody,
  setCorsHeaders,
} from "./infrastructure/frameworks/http.js";
import { LogIndexer } from "./infrastructure/indexing/LogIndexer.js";
import { LogDatabase } from "./infrastructure/persistence/LogDatabase.js";
import type { LogAggregateGroupBy, LogQueryOptions } from "./interfaces/index.js";
import {
  type BasicAuthPolicy,
  createBasicAuthPolicy,
  isApiAuthorized,
  resolveIngestProducerId,
} from "./usecases/auth.js";
import {
  createIngestAuthPolicy,
  createIngestPolicy,
  createIngestQueuePolicy,
  createIngestQueueState,
  createIngestState,
  drainIngestQueue,
  enqueueIngestQueueBatch,
  flushIngestQueueBatch,
  type IngestAuthPolicy,
  type IngestPolicy,
  type IngestQueuePolicy,
  type IngestQueueState,
  type IngestState,
  normalizeIngestRecord,
  parseIngestPayload,
  runIncrementalIngest,
} from "./usecases/ingest.js";

type ServerProtocol = "http" | "https";

type StartMikroScopeServerOptions = {
  dbPath: string;
  logsPath: string;
  port: number;
  dbRetentionDays?: number;
  dbAuditRetentionDays?: number;
  auditBackupDirectory?: string;
  host?: string;
  logRetentionDays?: number;
  logAuditRetentionDays?: number;
  maintenanceIntervalMs?: number;
  minFreeBytes?: number;
  protocol?: ServerProtocol;
  tlsCertPath?: string;
  tlsKeyPath?: string;
  apiToken?: string;
  authUsername?: string;
  authPassword?: string;
  corsAllowOrigin?: string;
  attachSignalHandlers?: boolean;
  ingestIntervalMs?: number;
  disableAutoIngest?: boolean;
  ingestProducers?: string;
  ingestMaxBodyBytes?: number;
  ingestAsyncQueue?: boolean;
  ingestQueueFlushMs?: number;
  alertWebhookUrl?: string;
  alertIntervalMs?: number;
  alertWindowMinutes?: number;
  alertErrorThreshold?: number;
  alertNoLogsThresholdMinutes?: number;
  alertCooldownMs?: number;
  alertWebhookTimeoutMs?: number;
  alertWebhookRetryAttempts?: number;
  alertWebhookBackoffMs?: number;
};

export type RunningMikroScopeServer = {
  close: () => Promise<void>;
  host: string;
  port: number;
  protocol: ServerProtocol;
  url: string;
};

type RequestContext = {
  apiToken?: string;
  basicAuth: BasicAuthPolicy;
  alertPolicy: AlertPolicy;
  alerting: AlertState;
  corsAllowOrigins: string[];
  db: LogDatabase;
  ingest: IngestState;
  ingestAuthPolicy: IngestAuthPolicy;
  ingestQueuePolicy: IngestQueuePolicy;
  ingestQueueState: IngestQueueState;
  ingestPolicy: IngestPolicy;
  logsPath: string;
  maintenancePolicy: MaintenancePolicy;
  maintenance: MaintenanceState;
  openApiJson?: {
    content: string;
    path: string;
  };
  openApiSpec?: {
    content: string;
    path: string;
  };
  preflight: PreflightResult;
  protocol: ServerProtocol;
  indexer: LogIndexer;
  queryService: LogQueryService;
  startedAtMs: number;
  url: string;
};

type MaintenancePolicy = {
  dbRetentionDays: number;
  dbAuditRetentionDays: number;
  auditBackupDirectory?: string;
  logRetentionDays: number;
  logAuditRetentionDays: number;
  maintenanceIntervalMs: number;
};

type MaintenanceState = {
  running: boolean;
  runs: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastDurationMs?: number;
  lastError?: string;
  filesDeletedLastRun: number;
  filesDeletedTotal: number;
  normalFilesDeletedLastRun: number;
  normalFilesDeletedTotal: number;
  auditFilesDeletedLastRun: number;
  auditFilesDeletedTotal: number;
  entriesDeletedLastRun: number;
  entriesDeletedTotal: number;
  normalEntriesDeletedLastRun: number;
  normalEntriesDeletedTotal: number;
  auditEntriesDeletedLastRun: number;
  auditEntriesDeletedTotal: number;
  fieldsDeletedLastRun: number;
  fieldsDeletedTotal: number;
  vacuumRuns: number;
};

type PreflightResult = {
  dbDirectory: string;
  dbDirectoryFreeBytes: number;
  logsDirectory: string;
  logsDirectoryFreeBytes: number;
  minFreeBytes: number;
};

type AlertPolicy = {
  enabled: boolean;
  webhookUrl?: string;
  intervalMs: number;
  windowMinutes: number;
  errorThreshold: number;
  noLogsThresholdMinutes: number;
  cooldownMs: number;
  webhookTimeoutMs: number;
  webhookRetryAttempts: number;
  webhookBackoffMs: number;
};

type AlertState = {
  running: boolean;
  runs: number;
  sent: number;
  suppressed: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastDurationMs?: number;
  lastError?: string;
  lastTriggerAtByRule: Record<string, string>;
};

class AlertWebhookError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "AlertWebhookError";
    this.retryable = retryable;
  }
}

function toNumber(value: string | null, fallback: number, max?: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  if (typeof max === "number") {
    return Math.min(max, parsed);
  }
  return parsed;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DB_RETENTION_DAYS = 30;
const DEFAULT_DB_AUDIT_RETENTION_DAYS = 365;
const DEFAULT_LOG_RETENTION_DAYS = 30;
const DEFAULT_LOG_AUDIT_RETENTION_DAYS = 365;
const DEFAULT_MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MIN_FREE_BYTES = 256 * 1024 * 1024;
const DEFAULT_ALERT_INTERVAL_MS = 30_000;
const DEFAULT_ALERT_WINDOW_MINUTES = 5;
const DEFAULT_ALERT_ERROR_THRESHOLD = 20;
const DEFAULT_ALERT_NO_LOGS_THRESHOLD_MINUTES = 0;
const DEFAULT_ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_ALERT_WEBHOOK_TIMEOUT_MS = 5_000;
const DEFAULT_ALERT_WEBHOOK_RETRY_ATTEMPTS = 3;
const DEFAULT_ALERT_WEBHOOK_BACKOFF_MS = 250;
const MAX_QUERY_LIMIT = 1_000;
const OPENAPI_JSON_RELATIVE_PATH = join("openapi", "openapi.json");
const OPENAPI_SPEC_RELATIVE_PATH = join("openapi", "openapi.yaml");

function asNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function parsePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function ensureWritableDirectory(path: string, label: string): void {
  mkdirSync(path, { recursive: true });
  const probe = join(path, `.mikroscope-write-probe-${process.pid}-${Date.now()}`);
  try {
    writeFileSync(probe, "ok", "utf8");
    unlinkSync(probe);
  } catch (error) {
    throw new Error(
      `Path preflight failed for ${label} (${path}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertMinimumFreeSpace(path: string, minFreeBytes: number, label: string): number {
  const stat = statfsSync(path);
  const freeBytes = asNumber(stat.bavail) * asNumber(stat.bsize);
  if (freeBytes < minFreeBytes) {
    throw new Error(
      `Path preflight failed for ${label} (${path}): insufficient free space (${freeBytes} < ${minFreeBytes})`,
    );
  }
  return freeBytes;
}

function listNdjsonFiles(rootPath: string): string[] {
  const resolved = resolve(rootPath);
  const files: string[] = [];
  const stack = [resolved];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      const entryName = String(entry.name);
      const path = join(current, entryName);
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (entry.isFile() && entryName.toLowerCase().endsWith(".ndjson")) {
        files.push(path);
      }
    }
  }

  return files;
}

function createMaintenanceState(): MaintenanceState {
  return {
    running: false,
    runs: 0,
    filesDeletedLastRun: 0,
    filesDeletedTotal: 0,
    normalFilesDeletedLastRun: 0,
    normalFilesDeletedTotal: 0,
    auditFilesDeletedLastRun: 0,
    auditFilesDeletedTotal: 0,
    entriesDeletedLastRun: 0,
    entriesDeletedTotal: 0,
    normalEntriesDeletedLastRun: 0,
    normalEntriesDeletedTotal: 0,
    auditEntriesDeletedLastRun: 0,
    auditEntriesDeletedTotal: 0,
    fieldsDeletedLastRun: 0,
    fieldsDeletedTotal: 0,
    vacuumRuns: 0,
  };
}

function createAlertPolicy(options: StartMikroScopeServerOptions): AlertPolicy {
  const rawWebhookUrl = options.alertWebhookUrl ?? process.env.MIKROSCOPE_ALERT_WEBHOOK_URL;
  const webhookUrl =
    typeof rawWebhookUrl === "string" && rawWebhookUrl.trim().length > 0
      ? rawWebhookUrl.trim()
      : undefined;

  return {
    enabled: Boolean(webhookUrl),
    webhookUrl,
    intervalMs: Math.max(
      1_000,
      parsePositiveNumber(
        options.alertIntervalMs ?? process.env.MIKROSCOPE_ALERT_INTERVAL_MS,
        DEFAULT_ALERT_INTERVAL_MS,
      ),
    ),
    windowMinutes: Math.max(
      1,
      parsePositiveNumber(
        options.alertWindowMinutes ?? process.env.MIKROSCOPE_ALERT_WINDOW_MINUTES,
        DEFAULT_ALERT_WINDOW_MINUTES,
      ),
    ),
    errorThreshold: Math.max(
      1,
      parsePositiveNumber(
        options.alertErrorThreshold ?? process.env.MIKROSCOPE_ALERT_ERROR_THRESHOLD,
        DEFAULT_ALERT_ERROR_THRESHOLD,
      ),
    ),
    noLogsThresholdMinutes: Math.max(
      0,
      parsePositiveNumber(
        options.alertNoLogsThresholdMinutes ??
          process.env.MIKROSCOPE_ALERT_NO_LOGS_THRESHOLD_MINUTES,
        DEFAULT_ALERT_NO_LOGS_THRESHOLD_MINUTES,
      ),
    ),
    cooldownMs: Math.max(
      1_000,
      parsePositiveNumber(
        options.alertCooldownMs ?? process.env.MIKROSCOPE_ALERT_COOLDOWN_MS,
        DEFAULT_ALERT_COOLDOWN_MS,
      ),
    ),
    webhookTimeoutMs: Math.max(
      250,
      parsePositiveNumber(
        options.alertWebhookTimeoutMs ?? process.env.MIKROSCOPE_ALERT_WEBHOOK_TIMEOUT_MS,
        DEFAULT_ALERT_WEBHOOK_TIMEOUT_MS,
      ),
    ),
    webhookRetryAttempts: Math.max(
      1,
      Math.trunc(
        parsePositiveNumber(
          options.alertWebhookRetryAttempts ?? process.env.MIKROSCOPE_ALERT_WEBHOOK_RETRY_ATTEMPTS,
          DEFAULT_ALERT_WEBHOOK_RETRY_ATTEMPTS,
        ),
      ),
    ),
    webhookBackoffMs: Math.max(
      25,
      parsePositiveNumber(
        options.alertWebhookBackoffMs ?? process.env.MIKROSCOPE_ALERT_WEBHOOK_BACKOFF_MS,
        DEFAULT_ALERT_WEBHOOK_BACKOFF_MS,
      ),
    ),
  };
}

function createAlertState(): AlertState {
  return {
    running: false,
    runs: 0,
    sent: 0,
    suppressed: 0,
    lastTriggerAtByRule: {},
  };
}

function createMaintenancePolicy(options: StartMikroScopeServerOptions): MaintenancePolicy {
  const rawAuditBackupDirectory =
    options.auditBackupDirectory ?? process.env.MIKROSCOPE_AUDIT_BACKUP_DIR;
  const auditBackupDirectory =
    typeof rawAuditBackupDirectory === "string" && rawAuditBackupDirectory.trim().length > 0
      ? resolve(rawAuditBackupDirectory)
      : undefined;

  return {
    dbRetentionDays: parsePositiveNumber(
      options.dbRetentionDays ?? process.env.MIKROSCOPE_DB_RETENTION_DAYS,
      DEFAULT_DB_RETENTION_DAYS,
    ),
    dbAuditRetentionDays: parsePositiveNumber(
      options.dbAuditRetentionDays ?? process.env.MIKROSCOPE_DB_AUDIT_RETENTION_DAYS,
      DEFAULT_DB_AUDIT_RETENTION_DAYS,
    ),
    logRetentionDays: parsePositiveNumber(
      options.logRetentionDays ?? process.env.MIKROSCOPE_LOG_RETENTION_DAYS,
      DEFAULT_LOG_RETENTION_DAYS,
    ),
    logAuditRetentionDays: parsePositiveNumber(
      options.logAuditRetentionDays ?? process.env.MIKROSCOPE_LOG_AUDIT_RETENTION_DAYS,
      DEFAULT_LOG_AUDIT_RETENTION_DAYS,
    ),
    auditBackupDirectory,
    maintenanceIntervalMs: Math.max(
      1_000,
      parsePositiveNumber(
        options.maintenanceIntervalMs ?? process.env.MIKROSCOPE_MAINTENANCE_INTERVAL_MS,
        DEFAULT_MAINTENANCE_INTERVAL_MS,
      ),
    ),
  };
}

function isAuditLogFile(filePath: string): boolean {
  const normalizedPath = filePath.toLowerCase();
  if (normalizedPath.includes(`${sep}audit${sep}`)) return true;
  const fileName = basename(normalizedPath);
  return fileName.includes("audit");
}

function runPreflightChecks(options: StartMikroScopeServerOptions): PreflightResult {
  const minFreeBytes = Math.max(
    1,
    parsePositiveNumber(
      options.minFreeBytes ?? process.env.MIKROSCOPE_MIN_FREE_BYTES,
      DEFAULT_MIN_FREE_BYTES,
    ),
  );

  const dbDirectory = dirname(resolve(options.dbPath));
  const logsDirectory = resolve(options.logsPath);

  ensureWritableDirectory(dbDirectory, "dbDirectory");
  ensureWritableDirectory(logsDirectory, "logsDirectory");

  const dbDirectoryFreeBytes = assertMinimumFreeSpace(dbDirectory, minFreeBytes, "dbDirectory");
  const logsDirectoryFreeBytes = assertMinimumFreeSpace(
    logsDirectory,
    minFreeBytes,
    "logsDirectory",
  );

  return {
    dbDirectory,
    dbDirectoryFreeBytes,
    logsDirectory,
    logsDirectoryFreeBytes,
    minFreeBytes,
  };
}

function cleanupOldLogFiles(
  logsPath: string,
  retentionDays: number,
  auditRetentionDays: number,
  auditBackupDirectory?: string,
): { normalDeleted: number; auditDeleted: number } {
  if (retentionDays <= 0 && auditRetentionDays <= 0) {
    return { normalDeleted: 0, auditDeleted: 0 };
  }

  const normalCutoffMs = Date.now() - retentionDays * DAY_MS;
  const auditCutoffMs = Date.now() - auditRetentionDays * DAY_MS;
  let normalDeleted = 0;
  let auditDeleted = 0;

  for (const filePath of listNdjsonFiles(logsPath)) {
    const isAuditFile = isAuditLogFile(filePath);
    const retentionEnabled = isAuditFile ? auditRetentionDays > 0 : retentionDays > 0;
    if (!retentionEnabled) continue;

    const stat = statSync(filePath);
    const cutoffMs = isAuditFile ? auditCutoffMs : normalCutoffMs;
    if (stat.mtimeMs < cutoffMs) {
      if (isAuditFile && auditBackupDirectory) {
        const relativePath = relative(resolve(logsPath), resolve(filePath));
        const backupPath = join(auditBackupDirectory, relativePath);
        mkdirSync(dirname(backupPath), { recursive: true });
        copyFileSync(filePath, backupPath);
      }
      rmSync(filePath, { force: true });
      if (isAuditFile) {
        auditDeleted++;
      } else {
        normalDeleted++;
      }
    }
  }

  return { normalDeleted, auditDeleted };
}

function runMaintenance(
  context: Pick<RequestContext, "db" | "logsPath" | "maintenance">,
  policy: MaintenancePolicy,
): void {
  if (context.maintenance.running) return;
  context.maintenance.running = true;
  context.maintenance.runs++;
  context.maintenance.lastRunAt = new Date().toISOString();
  const started = performance.now();

  try {
    const deletedFiles = cleanupOldLogFiles(
      context.logsPath,
      policy.logRetentionDays,
      policy.logAuditRetentionDays,
      policy.auditBackupDirectory,
    );
    const normalCutoffIso = new Date(Date.now() - policy.dbRetentionDays * DAY_MS).toISOString();
    const auditCutoffIso = new Date(
      Date.now() - policy.dbAuditRetentionDays * DAY_MS,
    ).toISOString();
    const prune = context.db.pruneByRetention({
      normalCutoffIso,
      auditCutoffIso,
    });
    const filesDeleted = deletedFiles.normalDeleted + deletedFiles.auditDeleted;

    context.maintenance.filesDeletedLastRun = filesDeleted;
    context.maintenance.filesDeletedTotal += filesDeleted;
    context.maintenance.normalFilesDeletedLastRun = deletedFiles.normalDeleted;
    context.maintenance.normalFilesDeletedTotal += deletedFiles.normalDeleted;
    context.maintenance.auditFilesDeletedLastRun = deletedFiles.auditDeleted;
    context.maintenance.auditFilesDeletedTotal += deletedFiles.auditDeleted;
    context.maintenance.entriesDeletedLastRun = prune.entriesDeleted;
    context.maintenance.entriesDeletedTotal += prune.entriesDeleted;
    context.maintenance.normalEntriesDeletedLastRun = prune.normalEntriesDeleted;
    context.maintenance.normalEntriesDeletedTotal += prune.normalEntriesDeleted;
    context.maintenance.auditEntriesDeletedLastRun = prune.auditEntriesDeleted;
    context.maintenance.auditEntriesDeletedTotal += prune.auditEntriesDeleted;
    context.maintenance.fieldsDeletedLastRun = prune.fieldsDeleted;
    context.maintenance.fieldsDeletedTotal += prune.fieldsDeleted;

    if (prune.entriesDeleted > 0 || filesDeleted > 0) {
      context.db.vacuum();
      context.maintenance.vacuumRuns++;
    }

    context.maintenance.lastSuccessAt = new Date().toISOString();
    context.maintenance.lastError = undefined;
  } catch (error) {
    context.maintenance.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    context.maintenance.lastDurationMs = Number((performance.now() - started).toFixed(2));
    context.maintenance.running = false;
  }
}

function shouldRetryWebhookStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function waitMs(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function sendAlertWebhook(url: string, payload: unknown, policy: AlertPolicy): Promise<void> {
  let lastError: AlertWebhookError | undefined;
  for (let attempt = 1; attempt <= policy.webhookRetryAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, policy.webhookTimeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (response.ok) return;

      const body = await response.text().catch(() => "");
      const snippet = body.slice(0, 240);
      throw new AlertWebhookError(
        `Alert webhook failed (${response.status})${snippet ? `: ${snippet}` : ""}`,
        shouldRetryWebhookStatus(response.status),
      );
    } catch (error) {
      const reason: AlertWebhookError =
        error instanceof AlertWebhookError
          ? error
          : error instanceof Error && error.name === "AbortError"
            ? new AlertWebhookError(
                `Alert webhook timeout after ${policy.webhookTimeoutMs}ms`,
                true,
              )
            : error instanceof Error
              ? new AlertWebhookError(error.message, true)
              : new AlertWebhookError(String(error), true);

      if (!reason.retryable || attempt >= policy.webhookRetryAttempts) {
        throw reason;
      }

      lastError = reason;
    } finally {
      clearTimeout(timeout);
    }

    const delayMs = Math.round(policy.webhookBackoffMs * 2 ** (attempt - 1));
    await waitMs(delayMs);
  }

  throw lastError || new AlertWebhookError("Alert webhook failed after retries", false);
}

async function runAlerting(
  context: Pick<RequestContext, "alertPolicy" | "alerting" | "queryService" | "url">,
): Promise<void> {
  if (!context.alertPolicy.enabled || !context.alertPolicy.webhookUrl) return;
  if (context.alerting.running) return;

  context.alerting.running = true;
  context.alerting.runs++;
  context.alerting.lastRunAt = new Date().toISOString();
  const nowMs = Date.now();
  const started = performance.now();

  try {
    const windowStartIso = new Date(
      nowMs - context.alertPolicy.windowMinutes * 60_000,
    ).toISOString();
    const errorCount = context.queryService.countLogs({
      from: windowStartIso,
      level: "ERROR",
    });
    const totalWindowCount = context.queryService.countLogs({
      from: windowStartIso,
    });

    const triggers: Array<{
      details: Record<string, unknown>;
      rule: string;
      severity: "warning" | "critical";
    }> = [];

    if (errorCount >= context.alertPolicy.errorThreshold) {
      triggers.push({
        rule: "error_threshold",
        severity: "critical",
        details: {
          errorCount,
          threshold: context.alertPolicy.errorThreshold,
          totalWindowCount,
          windowMinutes: context.alertPolicy.windowMinutes,
        },
      });
    }

    if (context.alertPolicy.noLogsThresholdMinutes > 0) {
      const noLogsStartIso = new Date(
        nowMs - context.alertPolicy.noLogsThresholdMinutes * 60_000,
      ).toISOString();
      const noLogsCount = context.queryService.countLogs({ from: noLogsStartIso });
      if (noLogsCount === 0) {
        triggers.push({
          rule: "no_logs",
          severity: "warning",
          details: {
            thresholdMinutes: context.alertPolicy.noLogsThresholdMinutes,
          },
        });
      }
    }

    for (const trigger of triggers) {
      const lastSentIso = context.alerting.lastTriggerAtByRule[trigger.rule];
      const lastSentMs = lastSentIso ? Date.parse(lastSentIso) : NaN;
      if (Number.isFinite(lastSentMs) && nowMs - lastSentMs < context.alertPolicy.cooldownMs) {
        context.alerting.suppressed++;
        continue;
      }

      await sendAlertWebhook(
        context.alertPolicy.webhookUrl,
        {
          source: "mikroscope",
          rule: trigger.rule,
          severity: trigger.severity,
          triggeredAt: new Date(nowMs).toISOString(),
          serviceUrl: context.url,
          details: trigger.details,
        },
        context.alertPolicy,
      );

      const sentAtIso = new Date().toISOString();
      context.alerting.lastTriggerAtByRule[trigger.rule] = sentAtIso;
      context.alerting.sent++;
    }

    context.alerting.lastSuccessAt = new Date().toISOString();
    context.alerting.lastError = undefined;
  } catch (error) {
    context.alerting.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    context.alerting.lastDurationMs = Number((performance.now() - started).toFixed(2));
    context.alerting.running = false;
  }
}

function parseQueryOptions(requestUrl: URL): LogQueryOptions {
  const auditValue = requestUrl.searchParams.get("audit");
  const audit =
    auditValue === null
      ? undefined
      : auditValue.toLowerCase() === "true" || auditValue === "1"
        ? true
        : auditValue.toLowerCase() === "false" || auditValue === "0"
          ? false
          : undefined;

  return {
    audit,
    cursor: requestUrl.searchParams.get("cursor") || undefined,
    field: requestUrl.searchParams.get("field") || undefined,
    from: requestUrl.searchParams.get("from") || undefined,
    level: requestUrl.searchParams.get("level") || undefined,
    limit: toNumber(requestUrl.searchParams.get("limit"), 100, MAX_QUERY_LIMIT),
    to: requestUrl.searchParams.get("to") || undefined,
    value: requestUrl.searchParams.get("value") || undefined,
  };
}

function parseAggregateGroupBy(raw: string | null): LogAggregateGroupBy | undefined {
  if (raw === "level" || raw === "event" || raw === "field" || raw === "correlation") return raw;
  return undefined;
}

function loadTextAsset(relativePath: string): { content: string; path: string } | undefined {
  const moduleDirectory = typeof __dirname === "string" ? __dirname : process.cwd();
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(moduleDirectory, "..", relativePath),
  ];

  for (const candidate of candidates) {
    try {
      const content = readFileSync(candidate, "utf8");
      if (content.length === 0) continue;
      return {
        content,
        path: candidate,
      };
    } catch {}
  }

  return undefined;
}

function loadOpenApiSpec(): { content: string; path: string } | undefined {
  return loadTextAsset(OPENAPI_SPEC_RELATIVE_PATH);
}

function loadOpenApiJson(): { content: string; path: string } | undefined {
  return loadTextAsset(OPENAPI_JSON_RELATIVE_PATH);
}

function renderScalarApiReferenceHtml(specPath: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MikroScope API Docs</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
      }
      #app {
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="app" style="font-family: system-ui, sans-serif; padding: 12px 16px;">
      <h1 style="margin: 0 0 6px;">MikroScope API Docs</h1>
      <p style="margin: 0;">
        Loading interactive docs. If this page remains plain, open
        <a href="${specPath}">${specPath}</a>.
      </p>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      if (typeof Scalar !== "undefined" && typeof Scalar.createApiReference === "function") {
        Scalar.createApiReference("#app", { url: "${specPath}" });
      }
    </script>
  </body>
</html>`;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  context: RequestContext,
): Promise<void> {
  const requestUrl = new URL(req.url || "/", `${context.protocol}://localhost`);
  setCorsHeaders(req, res, context.corsAllowOrigins);

  if (
    req.method === "OPTIONS" &&
    (requestUrl.pathname === "/health" ||
      requestUrl.pathname === "/openapi.json" ||
      requestUrl.pathname === "/openapi.yaml" ||
      requestUrl.pathname === "/docs" ||
      requestUrl.pathname === "/docs/" ||
      requestUrl.pathname.startsWith("/api/"))
  ) {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (requestUrl.pathname === "/openapi.yaml" && req.method === "GET") {
    if (!context.openApiSpec) {
      return json(
        req,
        res,
        404,
        { error: "OpenAPI specification not found." },
        context.corsAllowOrigins,
      );
    }

    setCorsHeaders(req, res, context.corsAllowOrigins);
    res.statusCode = 200;
    res.setHeader("content-type", "application/yaml; charset=utf-8");
    res.end(context.openApiSpec.content);
    return;
  }

  if (requestUrl.pathname === "/openapi.json" && req.method === "GET") {
    if (!context.openApiJson) {
      return json(
        req,
        res,
        404,
        { error: "OpenAPI JSON document not found." },
        context.corsAllowOrigins,
      );
    }

    setCorsHeaders(req, res, context.corsAllowOrigins);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(context.openApiJson.content);
    return;
  }

  if (
    (requestUrl.pathname === "/docs" || requestUrl.pathname === "/docs/") &&
    req.method === "GET"
  ) {
    if (!context.openApiSpec && !context.openApiJson) {
      return json(
        req,
        res,
        404,
        { error: "OpenAPI document not found." },
        context.corsAllowOrigins,
      );
    }

    const docsSpecPath = context.openApiJson ? "/openapi.json" : "/openapi.yaml";
    setCorsHeaders(req, res, context.corsAllowOrigins);
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(renderScalarApiReferenceHtml(docsSpecPath));
    return;
  }

  if (requestUrl.pathname === "/health") {
    const dbStats = context.db.getStats();
    const dbDirectoryFreeBytes = assertMinimumFreeSpace(
      context.preflight.dbDirectory,
      1,
      "dbDirectory",
    );
    const logsDirectoryFreeBytes = assertMinimumFreeSpace(
      context.preflight.logsDirectory,
      1,
      "logsDirectory",
    );
    return json(
      req,
      res,
      200,
      {
        ok: true,
        service: "mikroscope",
        uptimeSec: Number(((Date.now() - context.startedAtMs) / 1000).toFixed(2)),
        ingest: context.ingest,
        auth: {
          apiTokenEnabled: Boolean(context.apiToken),
          basicEnabled: context.basicAuth.enabled,
        },
        ingestPolicy: context.ingestPolicy,
        ingestEndpoint: {
          enabled: context.ingestAuthPolicy.enabled || context.basicAuth.enabled,
          maxBodyBytes: context.ingestAuthPolicy.maxBodyBytes,
          producerCount: context.ingestAuthPolicy.producerByToken.size,
          queue: {
            enabled: context.ingestQueuePolicy.enabled,
            flushMs: context.ingestQueuePolicy.flushMs,
            draining: context.ingestQueueState.draining,
            pendingBatches: context.ingestQueueState.pending.length,
            pendingRecords: context.ingestQueueState.pendingRecords,
            recordsFlushed: context.ingestQueueState.recordsFlushed,
            recordsQueued: context.ingestQueueState.recordsQueued,
            lastError: context.ingestQueueState.lastError,
            lastFlushAt: context.ingestQueueState.lastFlushAt,
          },
        },
        alerting: context.alerting,
        alertPolicy: {
          ...context.alertPolicy,
          webhookUrl: context.alertPolicy.webhookUrl ? "[configured]" : undefined,
        },
        maintenance: context.maintenance,
        retentionDays: {
          db: context.maintenancePolicy.dbRetentionDays,
          dbAudit: context.maintenancePolicy.dbAuditRetentionDays,
          logs: context.maintenancePolicy.logRetentionDays,
          logsAudit: context.maintenancePolicy.logAuditRetentionDays,
        },
        backup: {
          auditDirectory: context.maintenancePolicy.auditBackupDirectory,
        },
        storage: {
          dbApproximateSizeBytes: dbStats.approximateSizeBytes,
          dbDirectoryFreeBytes,
          logsDirectoryFreeBytes,
          minFreeBytes: context.preflight.minFreeBytes,
        },
      },
      context.corsAllowOrigins,
    );
  }

  if (requestUrl.pathname === "/api/ingest" && req.method === "POST") {
    if (!context.ingestAuthPolicy.enabled && !context.basicAuth.enabled) {
      return json(
        req,
        res,
        404,
        { error: "Ingest endpoint is not enabled." },
        context.corsAllowOrigins,
      );
    }

    const producerId = resolveIngestProducerId(
      req,
      context.basicAuth,
      context.ingestAuthPolicy.producerByToken,
    );
    if (!producerId) {
      return json(req, res, 401, { error: "Unauthorized" }, context.corsAllowOrigins);
    }

    let payload: unknown;
    try {
      payload = await readJsonBody(req, context.ingestAuthPolicy.maxBodyBytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.startsWith("Payload too large") ? 413 : 400;
      return json(req, res, status, { error: message }, context.corsAllowOrigins);
    }

    const logs = parseIngestPayload(payload);
    if (!logs) {
      return json(
        req,
        res,
        400,
        { error: "Invalid ingest payload. Expected an array or an object with a logs array." },
        context.corsAllowOrigins,
      );
    }

    const receivedAt = new Date().toISOString();
    const accepted: Array<Record<string, unknown>> = [];
    let rejected = 0;

    for (const log of logs) {
      const normalized = normalizeIngestRecord(log, producerId, receivedAt);
      if (!normalized) {
        rejected++;
        continue;
      }
      accepted.push(normalized);
    }

    let queued = false;
    if (accepted.length > 0) {
      if (context.ingestQueuePolicy.enabled) {
        enqueueIngestQueueBatch(context, { producerId, records: accepted });
        queued = true;
      } else {
        await flushIngestQueueBatch(context, [{ producerId, records: accepted }]);
      }
    }

    return json(
      req,
      res,
      queued ? 202 : 200,
      {
        accepted: accepted.length,
        queued,
        producerId,
        receivedAt,
        rejected,
      },
      context.corsAllowOrigins,
    );
  }

  if (
    requestUrl.pathname.startsWith("/api/") &&
    !isApiAuthorized(req, context.apiToken, context.basicAuth)
  ) {
    return json(req, res, 401, { error: "Unauthorized" }, context.corsAllowOrigins);
  }

  if (requestUrl.pathname === "/api/reindex" && req.method === "POST") {
    context.indexer.resetIncrementalState();
    const reset = context.db.reset();
    const report = await context.indexer.indexDirectory(context.logsPath);
    return json(req, res, 200, { report, reset }, context.corsAllowOrigins);
  }

  if (requestUrl.pathname === "/api/logs" && req.method === "GET") {
    const page = context.queryService.queryLogsPage(parseQueryOptions(requestUrl));
    return json(req, res, 200, page, context.corsAllowOrigins);
  }

  if (requestUrl.pathname === "/api/logs/aggregate" && req.method === "GET") {
    const groupBy = parseAggregateGroupBy(requestUrl.searchParams.get("groupBy"));
    if (!groupBy) {
      return json(
        req,
        res,
        400,
        { error: "Invalid groupBy. Expected level, event, field, or correlation." },
        context.corsAllowOrigins,
      );
    }
    const groupField = requestUrl.searchParams.get("groupField") || undefined;
    if (groupBy === "field" && (!groupField || groupField.trim().length === 0)) {
      return json(
        req,
        res,
        400,
        { error: "Missing required groupField when groupBy=field." },
        context.corsAllowOrigins,
      );
    }

    const options = parseQueryOptions(requestUrl);
    const buckets = context.queryService.aggregateLogs(
      {
        audit: options.audit,
        field: options.field,
        from: options.from,
        level: options.level,
        limit: options.limit,
        to: options.to,
        value: options.value,
      },
      groupBy,
      groupField,
    );

    return json(
      req,
      res,
      200,
      {
        buckets,
        groupBy,
        groupField,
      },
      context.corsAllowOrigins,
    );
  }

  json(req, res, 404, { error: "Not found" }, context.corsAllowOrigins);
}

function createServerForProtocol(
  protocol: ServerProtocol,
  tlsCertPath?: string,
  tlsKeyPath?: string,
): HttpServer | HttpsServer {
  if (protocol === "https") {
    if (!tlsCertPath || !tlsKeyPath) {
      throw new Error("HTTPS requires both tlsCertPath and tlsKeyPath");
    }

    const tlsOptions: HttpsServerOptions = {
      cert: readFileSync(tlsCertPath, "utf8"),
      key: readFileSync(tlsKeyPath, "utf8"),
    };

    return createHttpsServer(tlsOptions);
  }

  return createHttpServer();
}

async function listen(
  server: HttpServer | HttpsServer,
  host: string,
  port: number,
): Promise<{ host: string; port: number }> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve server address");
  }

  const info = address as AddressInfo;
  return {
    host,
    port: info.port,
  };
}

export async function startMikroScopeServer(
  options: StartMikroScopeServerOptions,
): Promise<RunningMikroScopeServer> {
  const host = options.host || "127.0.0.1";
  const protocol = options.protocol || "http";
  const attachSignalHandlers = options.attachSignalHandlers ?? true;
  const preflight = runPreflightChecks(options);
  const ingestPolicy = createIngestPolicy(options);
  const ingestAuthPolicy = createIngestAuthPolicy(options);
  const basicAuth = createBasicAuthPolicy(options);
  const ingestQueuePolicy = createIngestQueuePolicy(options);
  const ingest = createIngestState();
  const ingestQueueState = createIngestQueueState();
  const alertPolicy = createAlertPolicy(options);
  const alerting = createAlertState();
  const maintenancePolicy = createMaintenancePolicy(options);
  const maintenance = createMaintenanceState();
  const openApiJson = loadOpenApiJson();
  const openApiSpec = loadOpenApiSpec();

  const db = new LogDatabase(options.dbPath);
  const indexer = new LogIndexer(db);
  const queryService = new LogQueryService(db);
  await runIncrementalIngest({
    indexer,
    ingest,
    logsPath: options.logsPath,
  });

  const server = createServerForProtocol(protocol, options.tlsCertPath, options.tlsKeyPath);

  const context: RequestContext = {
    apiToken: options.apiToken,
    basicAuth,
    alertPolicy,
    alerting,
    corsAllowOrigins: parseAllowedOrigins(
      options.corsAllowOrigin ?? process.env.MIKROSCOPE_CORS_ALLOW_ORIGIN,
    ),
    db,
    ingest,
    ingestAuthPolicy,
    ingestQueuePolicy,
    ingestQueueState,
    ingestPolicy,
    logsPath: options.logsPath,
    maintenancePolicy,
    maintenance,
    openApiJson,
    openApiSpec,
    preflight,
    protocol,
    indexer,
    queryService,
    startedAtMs: Date.now(),
    url: `${protocol}://${host}:${options.port}`,
  };

  runMaintenance(context, maintenancePolicy);

  const maintenanceInterval = setInterval(() => {
    runMaintenance(context, maintenancePolicy);
  }, maintenancePolicy.maintenanceIntervalMs);
  maintenanceInterval.unref();

  const ingestInterval = ingestPolicy.enabled
    ? setInterval(() => {
        void runIncrementalIngest(context);
      }, ingestPolicy.intervalMs)
    : undefined;
  ingestInterval?.unref();

  const alertInterval = alertPolicy.enabled
    ? setInterval(() => {
        void runAlerting(context);
      }, alertPolicy.intervalMs)
    : undefined;
  alertInterval?.unref();

  server.on("request", (req, res) => {
    handleRequest(req, res, context).catch((error) => {
      json(
        req,
        res,
        500,
        { error: error instanceof Error ? error.message : String(error) },
        context.corsAllowOrigins,
      );
    });
  });

  const bound = await listen(server, host, options.port);
  const url = `${protocol}://${bound.host}:${bound.port}`;
  context.url = url;
  if (alertPolicy.enabled) {
    void runAlerting(context);
  }

  const close = async () => {
    clearInterval(maintenanceInterval);
    if (ingestInterval) clearInterval(ingestInterval);
    if (alertInterval) clearInterval(alertInterval);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    if (context.ingestQueueState.timer) {
      clearTimeout(context.ingestQueueState.timer);
      context.ingestQueueState.timer = undefined;
    }
    await drainIngestQueue(context);
    db.close();
  };

  if (attachSignalHandlers) {
    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      await close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  process.stdout.write(
    `[mikroscope] listening on ${url} logsPath=${options.logsPath} dbPath=${options.dbPath}\n`,
  );

  return {
    close,
    host: bound.host,
    port: bound.port,
    protocol,
    url,
  };
}
