import { MikroConf } from "mikroconf";

import type { ServerProtocol, StartMikroScopeServerOptions } from "../../server.js";

export type ResolveMikroScopeServerOptionsInput = {
  configFilePath?: string;
  env?: NodeJS.ProcessEnv;
  overrides?: Partial<StartMikroScopeServerOptions>;
};

export const DEFAULT_MIKROSCOPE_CONFIG_FILE_PATH = "mikroscope.config.json";

const DEFAULT_SERVER_OPTIONS: StartMikroScopeServerOptions = {
  attachSignalHandlers: true,
  dbAuditRetentionDays: 365,
  dbPath: "./data/mikroscope.db",
  dbRetentionDays: 30,
  disableAutoIngest: false,
  host: "127.0.0.1",
  ingestAsyncQueue: false,
  ingestIntervalMs: 2_000,
  ingestMaxBodyBytes: 1_048_576,
  ingestQueueFlushMs: 25,
  logAuditRetentionDays: 365,
  logsPath: "./logs",
  logRetentionDays: 30,
  maintenanceIntervalMs: 6 * 60 * 60 * 1000,
  minFreeBytes: 256 * 1024 * 1024,
  port: 4310,
  protocol: "http",
  alertCooldownMs: 5 * 60 * 1000,
  alertErrorThreshold: 20,
  alertIntervalMs: 30_000,
  alertNoLogsThresholdMinutes: 0,
  alertWebhookBackoffMs: 250,
  alertWebhookRetryAttempts: 3,
  alertWebhookTimeoutMs: 5_000,
  alertWindowMinutes: 5,
};

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asInteger(value: unknown): number | undefined {
  const parsed = asNumber(value);
  if (parsed === undefined) return undefined;
  return Math.trunc(parsed);
}

function asProtocol(value: unknown): ServerProtocol | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "http" || normalized === "https") return normalized;
  return undefined;
}

function normalizeOptionalStringFields(
  value: Partial<StartMikroScopeServerOptions>,
): Partial<StartMikroScopeServerOptions> {
  return {
    ...value,
    apiToken: asTrimmedString(value.apiToken),
    authPassword: asTrimmedString(value.authPassword),
    authUsername: asTrimmedString(value.authUsername),
    auditBackupDirectory: asTrimmedString(value.auditBackupDirectory),
    alertConfigPath: asTrimmedString(value.alertConfigPath),
    alertWebhookUrl: asTrimmedString(value.alertWebhookUrl),
    corsAllowOrigin: asTrimmedString(value.corsAllowOrigin),
    ingestProducers: asTrimmedString(value.ingestProducers),
    tlsCertPath: asTrimmedString(value.tlsCertPath),
    tlsKeyPath: asTrimmedString(value.tlsKeyPath),
  };
}

function normalizeCriticalFields(
  value: Partial<StartMikroScopeServerOptions>,
): StartMikroScopeServerOptions {
  const normalized = normalizeOptionalStringFields(value);
  const dbPath = asTrimmedString(normalized.dbPath) ?? DEFAULT_SERVER_OPTIONS.dbPath;
  const logsPath = asTrimmedString(normalized.logsPath) ?? DEFAULT_SERVER_OPTIONS.logsPath;
  const host = asTrimmedString(normalized.host) ?? DEFAULT_SERVER_OPTIONS.host;
  const port = asInteger(normalized.port);
  const protocol = asProtocol(normalized.protocol) ?? DEFAULT_SERVER_OPTIONS.protocol;
  const attachSignalHandlers =
    asBoolean(normalized.attachSignalHandlers) ?? DEFAULT_SERVER_OPTIONS.attachSignalHandlers;

  return {
    ...normalized,
    attachSignalHandlers,
    dbPath,
    host,
    logsPath,
    port: port && port > 0 ? port : DEFAULT_SERVER_OPTIONS.port,
    protocol,
  };
}

function readEnvOptions(env: NodeJS.ProcessEnv): Partial<StartMikroScopeServerOptions> {
  const protocol = asProtocol(env.MIKROSCOPE_PROTOCOL);
  const https = asBoolean(env.MIKROSCOPE_HTTPS);

  return normalizeOptionalStringFields({
    apiToken: env.MIKROSCOPE_API_TOKEN,
    authPassword: env.MIKROSCOPE_AUTH_PASSWORD,
    authUsername: env.MIKROSCOPE_AUTH_USERNAME,
    auditBackupDirectory: env.MIKROSCOPE_AUDIT_BACKUP_DIR,
    attachSignalHandlers: asBoolean(env.MIKROSCOPE_ATTACH_SIGNAL_HANDLERS),
    corsAllowOrigin: env.MIKROSCOPE_CORS_ALLOW_ORIGIN,
    dbAuditRetentionDays: asNumber(env.MIKROSCOPE_DB_AUDIT_RETENTION_DAYS),
    dbPath: env.MIKROSCOPE_DB_PATH,
    dbRetentionDays: asNumber(env.MIKROSCOPE_DB_RETENTION_DAYS),
    disableAutoIngest: asBoolean(env.MIKROSCOPE_DISABLE_AUTO_INGEST),
    host: env.MIKROSCOPE_HOST,
    ingestAsyncQueue: asBoolean(env.MIKROSCOPE_INGEST_ASYNC_QUEUE),
    ingestIntervalMs: asNumber(env.MIKROSCOPE_INGEST_INTERVAL_MS),
    ingestMaxBodyBytes: asNumber(env.MIKROSCOPE_INGEST_MAX_BODY_BYTES),
    ingestProducers: env.MIKROSCOPE_INGEST_PRODUCERS,
    ingestQueueFlushMs: asNumber(env.MIKROSCOPE_INGEST_QUEUE_FLUSH_MS),
    logAuditRetentionDays: asNumber(env.MIKROSCOPE_LOG_AUDIT_RETENTION_DAYS),
    logsPath: env.MIKROSCOPE_LOGS_PATH,
    logRetentionDays: asNumber(env.MIKROSCOPE_LOG_RETENTION_DAYS),
    maintenanceIntervalMs: asNumber(env.MIKROSCOPE_MAINTENANCE_INTERVAL_MS),
    minFreeBytes: asNumber(env.MIKROSCOPE_MIN_FREE_BYTES),
    port: asInteger(env.MIKROSCOPE_PORT),
    protocol: protocol ?? (https === true ? "https" : https === false ? "http" : undefined),
    tlsCertPath: env.MIKROSCOPE_TLS_CERT_PATH,
    tlsKeyPath: env.MIKROSCOPE_TLS_KEY_PATH,
    alertConfigPath: env.MIKROSCOPE_ALERT_CONFIG_PATH,
    alertCooldownMs: asNumber(env.MIKROSCOPE_ALERT_COOLDOWN_MS),
    alertErrorThreshold: asNumber(env.MIKROSCOPE_ALERT_ERROR_THRESHOLD),
    alertIntervalMs: asNumber(env.MIKROSCOPE_ALERT_INTERVAL_MS),
    alertNoLogsThresholdMinutes: asNumber(env.MIKROSCOPE_ALERT_NO_LOGS_THRESHOLD_MINUTES),
    alertWebhookBackoffMs: asNumber(env.MIKROSCOPE_ALERT_WEBHOOK_BACKOFF_MS),
    alertWebhookRetryAttempts: asInteger(env.MIKROSCOPE_ALERT_WEBHOOK_RETRY_ATTEMPTS),
    alertWebhookTimeoutMs: asNumber(env.MIKROSCOPE_ALERT_WEBHOOK_TIMEOUT_MS),
    alertWebhookUrl: env.MIKROSCOPE_ALERT_WEBHOOK_URL,
    alertWindowMinutes: asNumber(env.MIKROSCOPE_ALERT_WINDOW_MINUTES),
  });
}

function defaultsAsConfigOptions() {
  return Object.entries(DEFAULT_SERVER_OPTIONS).map(([path, defaultValue]) => ({
    defaultValue,
    path,
  }));
}

export function resolveServerConfigFilePath(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): string {
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== "--config") continue;
    const candidate = args[index + 1];
    if (candidate && !candidate.startsWith("-")) {
      return candidate;
    }
  }

  return asTrimmedString(env.MIKROSCOPE_CONFIG_PATH) ?? DEFAULT_MIKROSCOPE_CONFIG_FILE_PATH;
}

export function resolveMikroScopeServerOptions(
  input: ResolveMikroScopeServerOptionsInput = {},
): StartMikroScopeServerOptions {
  const env = input.env ?? process.env;
  const configFilePath =
    input.configFilePath ??
    asTrimmedString(env.MIKROSCOPE_CONFIG_PATH) ??
    DEFAULT_MIKROSCOPE_CONFIG_FILE_PATH;
  const envOptions = readEnvOptions(env);
  const overrides = normalizeOptionalStringFields(input.overrides || {});

  const config = new MikroConf({
    config: {
      ...envOptions,
      ...overrides,
    },
    configFilePath,
    options: defaultsAsConfigOptions(),
  });

  return normalizeCriticalFields(config.get<Partial<StartMikroScopeServerOptions>>());
}
