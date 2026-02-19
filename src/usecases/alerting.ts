import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { LogQueryService } from "../application/services/LogQueryService.js";

type AlertingOptions = {
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

export type AlertPolicy = {
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

export type AlertPolicyUpdate = {
  enabled?: boolean;
  webhookUrl?: string;
  intervalMs?: number;
  windowMinutes?: number;
  errorThreshold?: number;
  noLogsThresholdMinutes?: number;
  cooldownMs?: number;
  webhookTimeoutMs?: number;
  webhookRetryAttempts?: number;
  webhookBackoffMs?: number;
};

export type AlertState = {
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

type AlertingManagerOptions = {
  configPath: string;
  policy: AlertPolicy;
  queryService: LogQueryService;
  resolveServiceUrl: () => string;
  state?: AlertState;
};

export type AlertWebhookTestResult = {
  sentAt: string;
  targetUrl: string;
};

class AlertWebhookError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "AlertWebhookError";
    this.retryable = retryable;
  }
}

const DEFAULT_ALERT_INTERVAL_MS = 30_000;
const DEFAULT_ALERT_WINDOW_MINUTES = 5;
const DEFAULT_ALERT_ERROR_THRESHOLD = 20;
const DEFAULT_ALERT_NO_LOGS_THRESHOLD_MINUTES = 0;
const DEFAULT_ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_ALERT_WEBHOOK_TIMEOUT_MS = 5_000;
const DEFAULT_ALERT_WEBHOOK_RETRY_ATTEMPTS = 3;
const DEFAULT_ALERT_WEBHOOK_BACKOFF_MS = 250;
const DEFAULT_ALERT_CONFIG_FILENAME = "mikroscope.alert-config.json";

const ALERT_POLICY_FIELDS: ReadonlySet<string> = new Set([
  "enabled",
  "webhookUrl",
  "intervalMs",
  "windowMinutes",
  "errorThreshold",
  "noLogsThresholdMinutes",
  "cooldownMs",
  "webhookTimeoutMs",
  "webhookRetryAttempts",
  "webhookBackoffMs",
]);

function parsePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return undefined;
}

function normalizeWebhookUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed;
}

function parsePolicyNumberField(
  field: string,
  value: unknown,
  minimum: number,
  integer = false,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be a finite number.`);
  }

  const normalized = integer ? Math.trunc(parsed) : parsed;
  if (normalized < minimum) {
    throw new Error(`${field} must be greater than or equal to ${minimum}.`);
  }

  return normalized;
}

function assertObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return payload as Record<string, unknown>;
}

function assertKnownFields(record: Record<string, unknown>, label: string): void {
  for (const field of Object.keys(record)) {
    if (!ALERT_POLICY_FIELDS.has(field)) {
      throw new Error(`${label} includes unsupported field "${field}".`);
    }
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

export function createAlertPolicy(options: AlertingOptions): AlertPolicy {
  const rawWebhookUrl = options.alertWebhookUrl ?? process.env.MIKROSCOPE_ALERT_WEBHOOK_URL;
  const webhookUrl = normalizeWebhookUrl(rawWebhookUrl);

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

export function createAlertState(): AlertState {
  return {
    running: false,
    runs: 0,
    sent: 0,
    suppressed: 0,
    lastTriggerAtByRule: {},
  };
}

export function resolveAlertConfigPath(dbPath: string, configuredPath?: string): string {
  const pathFromOption = configuredPath?.trim();
  const pathFromEnv = process.env.MIKROSCOPE_ALERT_CONFIG_PATH?.trim();
  const configured = pathFromOption || pathFromEnv;
  if (configured) {
    return resolve(configured);
  }
  return resolve(dirname(resolve(dbPath)), DEFAULT_ALERT_CONFIG_FILENAME);
}

export function parseAlertPolicyUpdate(
  payload: unknown,
  allowEmpty = false,
  sourceLabel = "Alert config payload",
): AlertPolicyUpdate {
  const body = assertObjectPayload(payload, sourceLabel);
  assertKnownFields(body, sourceLabel);

  const update: AlertPolicyUpdate = {};

  if (Object.hasOwn(body, "enabled")) {
    const enabled = parseOptionalBoolean(body.enabled);
    if (enabled === undefined) {
      throw new Error("enabled must be a boolean.");
    }
    update.enabled = enabled;
  }

  if (Object.hasOwn(body, "webhookUrl")) {
    const webhookUrl = body.webhookUrl;
    if (webhookUrl === null) {
      update.webhookUrl = undefined;
    } else if (typeof webhookUrl === "string") {
      update.webhookUrl = webhookUrl;
    } else {
      throw new Error("webhookUrl must be a string or null.");
    }
  }

  if (Object.hasOwn(body, "intervalMs")) {
    update.intervalMs = parsePolicyNumberField("intervalMs", body.intervalMs, 1_000);
  }
  if (Object.hasOwn(body, "windowMinutes")) {
    update.windowMinutes = parsePolicyNumberField("windowMinutes", body.windowMinutes, 1);
  }
  if (Object.hasOwn(body, "errorThreshold")) {
    update.errorThreshold = parsePolicyNumberField("errorThreshold", body.errorThreshold, 1);
  }
  if (Object.hasOwn(body, "noLogsThresholdMinutes")) {
    update.noLogsThresholdMinutes = parsePolicyNumberField(
      "noLogsThresholdMinutes",
      body.noLogsThresholdMinutes,
      0,
    );
  }
  if (Object.hasOwn(body, "cooldownMs")) {
    update.cooldownMs = parsePolicyNumberField("cooldownMs", body.cooldownMs, 1_000);
  }
  if (Object.hasOwn(body, "webhookTimeoutMs")) {
    update.webhookTimeoutMs = parsePolicyNumberField(
      "webhookTimeoutMs",
      body.webhookTimeoutMs,
      250,
    );
  }
  if (Object.hasOwn(body, "webhookRetryAttempts")) {
    update.webhookRetryAttempts = parsePolicyNumberField(
      "webhookRetryAttempts",
      body.webhookRetryAttempts,
      1,
      true,
    );
  }
  if (Object.hasOwn(body, "webhookBackoffMs")) {
    update.webhookBackoffMs = parsePolicyNumberField("webhookBackoffMs", body.webhookBackoffMs, 25);
  }

  if (!allowEmpty && Object.keys(update).length === 0) {
    throw new Error("Alert config payload must include at least one updatable field.");
  }

  return update;
}

export function applyAlertPolicyUpdate(
  current: AlertPolicy,
  update: AlertPolicyUpdate,
): AlertPolicy {
  const next: AlertPolicy = {
    ...current,
  };

  if (Object.hasOwn(update, "webhookUrl")) {
    next.webhookUrl = normalizeWebhookUrl(update.webhookUrl);
    if (!Object.hasOwn(update, "enabled")) {
      next.enabled = Boolean(next.webhookUrl);
    }
  }
  if (Object.hasOwn(update, "enabled")) {
    next.enabled = Boolean(update.enabled);
  }
  if (Object.hasOwn(update, "intervalMs") && update.intervalMs !== undefined) {
    next.intervalMs = update.intervalMs;
  }
  if (Object.hasOwn(update, "windowMinutes") && update.windowMinutes !== undefined) {
    next.windowMinutes = update.windowMinutes;
  }
  if (Object.hasOwn(update, "errorThreshold") && update.errorThreshold !== undefined) {
    next.errorThreshold = update.errorThreshold;
  }
  if (
    Object.hasOwn(update, "noLogsThresholdMinutes") &&
    update.noLogsThresholdMinutes !== undefined
  ) {
    next.noLogsThresholdMinutes = update.noLogsThresholdMinutes;
  }
  if (Object.hasOwn(update, "cooldownMs") && update.cooldownMs !== undefined) {
    next.cooldownMs = update.cooldownMs;
  }
  if (Object.hasOwn(update, "webhookTimeoutMs") && update.webhookTimeoutMs !== undefined) {
    next.webhookTimeoutMs = update.webhookTimeoutMs;
  }
  if (Object.hasOwn(update, "webhookRetryAttempts") && update.webhookRetryAttempts !== undefined) {
    next.webhookRetryAttempts = update.webhookRetryAttempts;
  }
  if (Object.hasOwn(update, "webhookBackoffMs") && update.webhookBackoffMs !== undefined) {
    next.webhookBackoffMs = update.webhookBackoffMs;
  }

  if (next.enabled && !next.webhookUrl) {
    throw new Error("webhookUrl must be configured when alerting is enabled.");
  }

  return next;
}

export function loadAlertPolicy(configPath: string, fallback: AlertPolicy): AlertPolicy {
  let raw = "";
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return fallback;
    }
    throw new Error(
      `Failed to read alert config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (raw.trim().length === 0) {
    return fallback;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to parse alert config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const update = parseAlertPolicyUpdate(parsed, true, "Persisted alert config");
  if (Object.keys(update).length === 0) {
    return fallback;
  }

  return applyAlertPolicyUpdate(fallback, update);
}

export function persistAlertPolicy(configPath: string, policy: AlertPolicy): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(policy, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export class AlertingManager {
  private readonly configPath: string;
  private readonly queryService: LogQueryService;
  private readonly resolveServiceUrl: () => string;
  private readonly state: AlertState;
  private policy: AlertPolicy;
  private interval?: ReturnType<typeof setInterval>;

  constructor(options: AlertingManagerOptions) {
    this.configPath = options.configPath;
    this.queryService = options.queryService;
    this.resolveServiceUrl = options.resolveServiceUrl;
    this.policy = options.policy;
    this.state = options.state ?? createAlertState();
  }

  start(): void {
    this.reschedule();
    if (this.policy.enabled && this.policy.webhookUrl) {
      void this.runCycle();
    }
  }

  stop(): void {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = undefined;
  }

  getConfigPath(): string {
    return this.configPath;
  }

  getPolicy(): AlertPolicy {
    return {
      ...this.policy,
    };
  }

  getMaskedPolicy(): AlertPolicy {
    return {
      ...this.policy,
      webhookUrl: this.policy.webhookUrl ? "[configured]" : undefined,
    };
  }

  getState(): AlertState {
    return {
      ...this.state,
      lastTriggerAtByRule: {
        ...this.state.lastTriggerAtByRule,
      },
    };
  }

  updatePolicy(update: AlertPolicyUpdate): AlertPolicy {
    this.policy = applyAlertPolicyUpdate(this.policy, update);
    persistAlertPolicy(this.configPath, this.policy);
    this.reschedule();
    return this.getPolicy();
  }

  async testWebhook(webhookUrlOverride?: string): Promise<AlertWebhookTestResult> {
    const targetUrl = normalizeWebhookUrl(webhookUrlOverride) ?? this.policy.webhookUrl;
    if (!targetUrl) {
      throw new Error("Alert webhook URL is not configured.");
    }

    const sentAt = new Date().toISOString();
    await sendAlertWebhook(
      targetUrl,
      {
        source: "mikroscope",
        rule: "manual_test",
        severity: "warning",
        triggeredAt: sentAt,
        serviceUrl: this.resolveServiceUrl(),
        details: {
          message: "Manual webhook test event",
        },
      },
      {
        ...this.policy,
        webhookUrl: targetUrl,
      },
    );

    return {
      sentAt,
      targetUrl,
    };
  }

  async runCycle(): Promise<void> {
    const policy = this.getPolicy();
    if (!policy.enabled || !policy.webhookUrl) return;
    if (this.state.running) return;

    this.state.running = true;
    this.state.runs++;
    this.state.lastRunAt = new Date().toISOString();
    const nowMs = Date.now();
    const started = performance.now();

    try {
      const windowStartIso = new Date(nowMs - policy.windowMinutes * 60_000).toISOString();
      const errorCount = this.queryService.countLogs({
        from: windowStartIso,
        level: "ERROR",
      });
      const totalWindowCount = this.queryService.countLogs({
        from: windowStartIso,
      });

      const triggers: Array<{
        details: Record<string, unknown>;
        rule: string;
        severity: "warning" | "critical";
      }> = [];

      if (errorCount >= policy.errorThreshold) {
        triggers.push({
          rule: "error_threshold",
          severity: "critical",
          details: {
            errorCount,
            threshold: policy.errorThreshold,
            totalWindowCount,
            windowMinutes: policy.windowMinutes,
          },
        });
      }

      if (policy.noLogsThresholdMinutes > 0) {
        const noLogsStartIso = new Date(
          nowMs - policy.noLogsThresholdMinutes * 60_000,
        ).toISOString();
        const noLogsCount = this.queryService.countLogs({ from: noLogsStartIso });
        if (noLogsCount === 0) {
          triggers.push({
            rule: "no_logs",
            severity: "warning",
            details: {
              thresholdMinutes: policy.noLogsThresholdMinutes,
            },
          });
        }
      }

      for (const trigger of triggers) {
        const lastSentIso = this.state.lastTriggerAtByRule[trigger.rule];
        const lastSentMs = lastSentIso ? Date.parse(lastSentIso) : NaN;
        if (Number.isFinite(lastSentMs) && nowMs - lastSentMs < policy.cooldownMs) {
          this.state.suppressed++;
          continue;
        }

        await sendAlertWebhook(
          policy.webhookUrl,
          {
            source: "mikroscope",
            rule: trigger.rule,
            severity: trigger.severity,
            triggeredAt: new Date(nowMs).toISOString(),
            serviceUrl: this.resolveServiceUrl(),
            details: trigger.details,
          },
          policy,
        );

        const sentAtIso = new Date().toISOString();
        this.state.lastTriggerAtByRule[trigger.rule] = sentAtIso;
        this.state.sent++;
      }

      this.state.lastSuccessAt = new Date().toISOString();
      this.state.lastError = undefined;
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.state.lastDurationMs = Number((performance.now() - started).toFixed(2));
      this.state.running = false;
    }
  }

  private reschedule(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }

    if (!this.policy.enabled || !this.policy.webhookUrl) {
      return;
    }

    this.interval = setInterval(() => {
      void this.runCycle();
    }, this.policy.intervalMs);
    this.interval.unref();
  }
}
