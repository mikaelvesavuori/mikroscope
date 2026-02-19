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
import { createServer as createHttpServer } from "node:http";
import {
  createServer as createHttpsServer,
  type Server as HttpsServer,
  type ServerOptions as HttpsServerOptions,
} from "node:https";
import type { AddressInfo } from "node:net";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handleRequest } from "./application/server/handleRequest.js";
import { LogQueryService } from "./application/services/LogQueryService.js";
import { json, parseAllowedOrigins } from "./infrastructure/frameworks/http.js";
import { LogIndexer } from "./infrastructure/indexing/LogIndexer.js";
import { LogDatabase } from "./infrastructure/persistence/LogDatabase.js";
import {
  AlertingManager,
  createAlertPolicy,
  loadAlertPolicy,
  resolveAlertConfigPath,
} from "./usecases/alerting.js";
import { type BasicAuthPolicy, createBasicAuthPolicy } from "./usecases/auth.js";
import {
  createIngestAuthPolicy,
  createIngestPolicy,
  createIngestQueuePolicy,
  createIngestQueueState,
  createIngestState,
  drainIngestQueue,
  type IngestAuthPolicy,
  type IngestPolicy,
  type IngestQueuePolicy,
  type IngestQueueState,
  type IngestState,
  runIncrementalIngest,
} from "./usecases/ingest.js";

export type ServerProtocol = "http" | "https";

export type StartMikroScopeServerOptions = {
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
  alertConfigPath?: string;
};

export type RunningMikroScopeServer = {
  close: () => Promise<void>;
  host: string;
  port: number;
  protocol: ServerProtocol;
  url: string;
};

export type RequestContext = {
  apiToken?: string;
  basicAuth: BasicAuthPolicy;
  alerts: AlertingManager;
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

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DB_RETENTION_DAYS = 30;
const DEFAULT_DB_AUDIT_RETENTION_DAYS = 365;
const DEFAULT_LOG_RETENTION_DAYS = 30;
const DEFAULT_LOG_AUDIT_RETENTION_DAYS = 365;
const DEFAULT_MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MIN_FREE_BYTES = 256 * 1024 * 1024;
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

function loadTextAsset(relativePath: string): { content: string; path: string } | undefined {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
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
  const baseAlertPolicy = createAlertPolicy(options);
  const alertConfigPath = resolveAlertConfigPath(options.dbPath, options.alertConfigPath);
  const alertPolicy = loadAlertPolicy(alertConfigPath, baseAlertPolicy);
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
  let serviceUrl = `${protocol}://${host}:${options.port}`;
  const alerts = new AlertingManager({
    configPath: alertConfigPath,
    policy: alertPolicy,
    queryService,
    resolveServiceUrl: () => serviceUrl,
  });

  const context: RequestContext = {
    apiToken: options.apiToken,
    basicAuth,
    alerts,
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
    url: serviceUrl,
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
  serviceUrl = url;
  context.url = url;
  alerts.start();

  const close = async () => {
    clearInterval(maintenanceInterval);
    if (ingestInterval) clearInterval(ingestInterval);
    alerts.stop();
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
