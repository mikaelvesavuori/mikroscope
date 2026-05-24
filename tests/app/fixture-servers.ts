import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Primitive = string | number | boolean | null | undefined;

type FixtureEntry = {
  id?: Primitive;
  timestamp?: Primitive;
  level?: Primitive;
  event?: Primitive;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type FixturePayload = {
  entries: FixtureEntry[];
};

type StartedServer = {
  origin: string;
  close: () => Promise<void>;
};

type FixtureApiServer = StartedServer & {
  requests: URL[];
  setWebhookCrudEnabled: (enabled: boolean) => void;
};

type AlertPolicy = {
  cooldownMs: number;
  webhookUrl: string;
  enabled: boolean;
  errorThreshold: number;
  intervalMs: number;
  noLogsThresholdMinutes: number;
  webhookBackoffMs: number;
  webhookRetryAttempts: number;
  webhookTimeoutMs: number;
  windowMinutes: number;
};

type FixtureApiOptions = {
  enableWebhookCrud?: boolean;
};

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..", "..");
const FIXTURE_RECENCY_LAG_MS = 5 * 60 * 1000;

function toText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function toInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(toText(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function byPath(input: unknown, path: string): unknown {
  if (!input || typeof input !== "object") return undefined;
  const keys = path.split(".");
  let cursor: unknown = input;
  for (const key of keys) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function getFieldValue(entry: FixtureEntry, field: string): unknown {
  const normalized = toText(field).trim();
  if (!normalized) return undefined;
  if (normalized.includes(".")) {
    const nested = byPath(entry, normalized);
    if (nested !== undefined) return nested;
    return byPath(entry.data, normalized);
  }

  if (entry[normalized] !== undefined) return entry[normalized];
  if (entry.data && typeof entry.data === "object") {
    return (entry.data as Record<string, unknown>)[normalized];
  }
  return undefined;
}

function entryTimestampMs(entry: FixtureEntry): number {
  const direct = Date.parse(toText(entry.timestamp));
  if (Number.isFinite(direct)) return direct;
  const dataTs = Date.parse(toText(getFieldValue(entry, "timestamp")));
  return Number.isFinite(dataTs) ? dataTs : Number.NaN;
}

function parseCursor(cursor: string | null): number {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const offset = Number(decoded?.offset);
    if (!Number.isFinite(offset) || offset < 0) return 0;
    return Math.floor(offset);
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function shiftTimestampValue(value: unknown, deltaMs: number): Primitive {
  if (typeof value !== "string") return value as Primitive;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed + deltaMs).toISOString();
}

function shiftFixtureEntryTimestamps(entry: FixtureEntry, deltaMs: number): FixtureEntry {
  const shifted: FixtureEntry = {
    ...entry,
    timestamp: shiftTimestampValue(entry.timestamp, deltaMs),
  };

  if (entry.data && typeof entry.data === "object" && !Array.isArray(entry.data)) {
    shifted.data = {
      ...entry.data,
      timestamp: shiftTimestampValue(entry.data.timestamp, deltaMs),
    };
  }

  return shifted;
}

function findLatestFixtureTimestampMs(entries: FixtureEntry[]): number {
  let latest = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    const timestamp = entryTimestampMs(entry);
    if (Number.isFinite(timestamp)) {
      latest = Math.max(latest, timestamp);
    }
  }
  return latest;
}

function shiftFixtureIntoRecentWindow(entries: FixtureEntry[]): FixtureEntry[] {
  const latest = findLatestFixtureTimestampMs(entries);
  if (!Number.isFinite(latest)) return entries;
  const targetLatest = Date.now() - FIXTURE_RECENCY_LAG_MS;
  const deltaMs = targetLatest - latest;
  return entries.map((entry) => shiftFixtureEntryTimestamps(entry, deltaMs));
}

function applyFilters(entries: FixtureEntry[], params: URLSearchParams): FixtureEntry[] {
  const from = toText(params.get("from")).trim();
  const to = toText(params.get("to")).trim();
  const level = toText(params.get("level")).trim().toUpperCase();
  const audit = toText(params.get("audit")).trim().toLowerCase();
  const field = toText(params.get("field")).trim();
  const value = toText(params.get("value")).trim().toLowerCase();

  const fromMs = from ? Date.parse(from) : Number.NaN;
  const toMs = to ? Date.parse(to) : Number.NaN;

  return entries.filter((entry) => {
    const ts = entryTimestampMs(entry);
    if (Number.isFinite(fromMs) && Number.isFinite(ts) && ts < fromMs) return false;
    if (Number.isFinite(toMs) && Number.isFinite(ts) && ts > toMs) return false;

    if (level && toText(entry.level).trim().toUpperCase() !== level) return false;

    if (audit === "true" || audit === "false") {
      const auditValue = String(Boolean(getFieldValue(entry, "audit")));
      if (auditValue !== audit) return false;
    }

    if (field && value) {
      const candidate = getFieldValue(entry, field);
      if (!toText(candidate).toLowerCase().includes(value)) return false;
    }

    return true;
  });
}

function aggregateBuckets(
  entries: FixtureEntry[],
  groupBy: string,
  groupField: string,
  limit: number,
): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    let key = "";
    if (groupBy === "level") {
      key = toText(entry.level).trim();
    } else if (groupBy === "event") {
      key = toText(entry.event).trim();
    } else if (groupBy === "field") {
      key = toText(getFieldValue(entry, groupField)).trim();
    } else if (groupBy === "correlation") {
      key = toText(getFieldValue(entry, "correlationId")).trim();
      if (!key) {
        key = toText(getFieldValue(entry, "requestId")).trim();
      }
    }

    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.key.localeCompare(right.key);
    })
    .slice(0, limit);
}

function buildHealthPayload() {
  const nowIso = new Date().toISOString();
  return {
    ok: true,
    service: "mikroscope",
    uptimeSec: 1234,
    ingest: {
      running: true,
      runs: 1,
      indexed: 0,
      lastDurationMs: 1,
      lastRunAt: nowIso,
      lastSuccessAt: nowIso,
    },
    auth: {
      apiTokenEnabled: false,
      basicEnabled: false,
    },
    ingestPolicy: {
      intervalMs: 2000,
      disableAutoIngest: false,
      maxBodyBytes: 1_048_576,
    },
    ingestEndpoint: {
      enabled: true,
      maxBodyBytes: 1_048_576,
      producerCount: 1,
      queue: {
        enabled: false,
        flushMs: 25,
        draining: false,
        pendingBatches: 0,
        pendingRecords: 0,
        recordsFlushed: 0,
        recordsQueued: 0,
      },
    },
    alerting: {
      running: true,
      runs: 42,
      sent: 5,
      suppressed: 2,
      lastRunAt: nowIso,
      lastSuccessAt: nowIso,
      lastDurationMs: 12,
      lastError: "",
      lastTriggerAtByRule: {},
    },
    alertPolicy: {
      enabled: true,
      webhookUrl: "[configured]",
      intervalMs: 30_000,
      windowMinutes: 5,
      errorThreshold: 20,
      noLogsThresholdMinutes: 0,
      cooldownMs: 300_000,
      webhookTimeoutMs: 5000,
      webhookRetryAttempts: 3,
      webhookBackoffMs: 250,
    },
    maintenance: {
      running: true,
      runs: 1,
      deletedDbRows: 0,
      deletedLogFiles: 0,
      backupFailures: 0,
      lowDiskSkips: 0,
      lastRunAt: nowIso,
      lastSuccessAt: nowIso,
      lastDurationMs: 5,
    },
    retentionDays: {
      db: 30,
      dbAudit: 365,
      logs: 30,
      logsAudit: 365,
    },
    backup: {
      auditDirectory: "",
    },
    storage: {
      dbPath: "/tmp/mikroscope.db",
      logsPath: "/tmp/logs",
      dbBytes: 1000,
      logsBytes: 2000,
      freeBytes: 10_000_000,
      minFreeBytes: 1_000_000,
    },
  };
}

function buildOpenApiDocument(options: FixtureApiOptions = {}) {
  const includeWebhookCrud = Boolean(options.enableWebhookCrud);
  const paths: Record<string, Record<string, unknown>> = {
    "/health": {
      get: {
        operationId: "health",
      },
    },
    "/api/logs": {
      get: {
        operationId: "queryLogs",
      },
    },
    "/api/logs/aggregate": {
      get: {
        operationId: "aggregateLogs",
      },
    },
  };

  if (includeWebhookCrud) {
    paths["/api/alerts/config"] = {
      get: {
        operationId: "getAlertConfig",
        summary: "Read active alert webhook policy",
        tags: ["Alerts"],
      },
      put: {
        operationId: "updateAlertConfig",
        summary: "Update alert webhook policy",
        tags: ["Alerts"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  enabled: { type: "boolean" },
                  webhookUrl: { type: "string", format: "uri" },
                  intervalMs: { type: "number" },
                  windowMinutes: { type: "number" },
                  errorThreshold: { type: "number" },
                  noLogsThresholdMinutes: { type: "number" },
                  cooldownMs: { type: "number" },
                  webhookTimeoutMs: { type: "number" },
                  webhookRetryAttempts: { type: "integer" },
                  webhookBackoffMs: { type: "number" },
                },
              },
            },
          },
        },
      },
    };

    paths["/api/alerts/test-webhook"] = {
      post: {
        operationId: "testAlertWebhook",
        summary: "Send a manual webhook test event",
        tags: ["Alerts"],
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Fixture MikroScope API",
      version: "0.0.0-test",
    },
    paths,
  };
}

function jsonResponse(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.end(JSON.stringify(payload));
}

function methodNotAllowed(res: ServerResponse) {
  jsonResponse(res, 405, { error: "Method not allowed" });
}

function notFound(res: ServerResponse) {
  jsonResponse(res, 404, { error: "Not found" });
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") return {};
  return parsed as Record<string, unknown>;
}

async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  port = 0,
): Promise<StartedServer & { port: number }> {
  const server = createServer((req, res) => {
    void Promise.resolve(handler(req, res)).catch((error) => {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: String(error) }));
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve server address.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    port: address.port,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  };
}

export async function loadFixture(
  fixturePath = "tests/fixtures/logs.fixture.json",
): Promise<FixturePayload> {
  const absolute = isAbsolute(fixturePath) ? fixturePath : resolve(projectRoot, fixturePath);
  const raw = JSON.parse(await readFile(absolute, "utf8"));
  const entries = Array.isArray(raw?.entries) ? raw.entries : [];
  return { entries: shiftFixtureIntoRecentWindow(entries) };
}

export async function startFixtureApiServer(
  fixture: FixturePayload,
  port = 0,
  options: FixtureApiOptions = {},
): Promise<FixtureApiServer> {
  const requests: URL[] = [];
  const entries = fixture.entries;
  let webhookCrudEnabled = Boolean(options.enableWebhookCrud);
  const alertConfigPath = "/tmp/mikroscope.alert-policy.json";
  let alertPolicy: AlertPolicy = {
    cooldownMs: 300_000,
    enabled: true,
    errorThreshold: 20,
    intervalMs: 30_000,
    noLogsThresholdMinutes: 0,
    webhookBackoffMs: 250,
    webhookRetryAttempts: 3,
    webhookTimeoutMs: 5000,
    webhookUrl: "https://hooks.example.test/alerts/primary",
    windowMinutes: 5,
  };

  const started = await startServer((req, res) => {
    if (req.method === "OPTIONS") {
      jsonResponse(res, 204, {});
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    requests.push(url);

    if (url.pathname === "/api/logs") {
      if (req.method !== "GET") {
        methodNotAllowed(res);
        return;
      }
      const filtered = applyFilters(entries, url.searchParams);
      const limit = clamp(toInt(url.searchParams.get("limit"), 1000), 1, 1000);
      const offset = parseCursor(url.searchParams.get("cursor"));
      const pageEntries = filtered.slice(offset, offset + limit);
      const nextOffset = offset + pageEntries.length;
      const hasMore = nextOffset < filtered.length;
      jsonResponse(res, 200, {
        entries: pageEntries,
        hasMore,
        limit,
        nextCursor: hasMore ? encodeCursor(nextOffset) : null,
      });
      return;
    }

    if (url.pathname === "/api/logs/aggregate") {
      if (req.method !== "GET") {
        methodNotAllowed(res);
        return;
      }
      const filtered = applyFilters(entries, url.searchParams);
      const groupBy = toText(url.searchParams.get("groupBy")).trim();
      const groupField = toText(url.searchParams.get("groupField")).trim();
      const limit = clamp(toInt(url.searchParams.get("limit"), 10), 1, 200);
      const buckets = aggregateBuckets(filtered, groupBy, groupField, limit);
      jsonResponse(res, 200, { buckets, groupBy });
      return;
    }

    if (url.pathname === "/health") {
      if (req.method !== "GET") {
        methodNotAllowed(res);
        return;
      }
      jsonResponse(res, 200, buildHealthPayload());
      return;
    }

    if (webhookCrudEnabled && url.pathname === "/api/alerts/config") {
      if (req.method === "GET") {
        jsonResponse(res, 200, { configPath: alertConfigPath, policy: alertPolicy });
        return;
      }
      if (req.method === "PUT") {
        return Promise.resolve(readJsonBody(req)).then((body) => {
          const allowedKeys = new Set([
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
          for (const key of Object.keys(body)) {
            if (!allowedKeys.has(key)) {
              jsonResponse(res, 400, { error: `Unsupported field "${key}".` });
              return;
            }
          }

          const next: AlertPolicy = { ...alertPolicy };
          if (Object.hasOwn(body, "enabled")) {
            if (typeof body.enabled !== "boolean") {
              jsonResponse(res, 400, { error: "enabled must be a boolean." });
              return;
            }
            next.enabled = body.enabled;
          }
          if (Object.hasOwn(body, "webhookUrl")) {
            if (body.webhookUrl === null) {
              next.webhookUrl = "";
            } else if (typeof body.webhookUrl === "string") {
              next.webhookUrl = body.webhookUrl.trim();
            } else {
              jsonResponse(res, 400, { error: "webhookUrl must be a string or null." });
              return;
            }
          }

          const numberSpecs: Array<{
            integer?: boolean;
            key: keyof AlertPolicy;
            min: number;
          }> = [
            { key: "intervalMs", min: 1000 },
            { key: "windowMinutes", min: 1 },
            { key: "errorThreshold", min: 1 },
            { key: "noLogsThresholdMinutes", min: 0 },
            { key: "cooldownMs", min: 1000 },
            { key: "webhookTimeoutMs", min: 250 },
            { integer: true, key: "webhookRetryAttempts", min: 1 },
            { key: "webhookBackoffMs", min: 25 },
          ];
          for (const spec of numberSpecs) {
            if (!Object.hasOwn(body, spec.key)) continue;
            const value = body[spec.key];
            if (typeof value !== "number" || !Number.isFinite(value)) {
              jsonResponse(res, 400, { error: `${spec.key} must be a number.` });
              return;
            }
            if (spec.integer && !Number.isInteger(value)) {
              jsonResponse(res, 400, { error: `${spec.key} must be an integer.` });
              return;
            }
            if (value < spec.min) {
              jsonResponse(res, 400, { error: `${spec.key} must be at least ${spec.min}.` });
              return;
            }
            Object.assign(next, { [spec.key]: value });
          }

          if (next.enabled && !next.webhookUrl) {
            jsonResponse(res, 400, {
              error: "webhookUrl must be configured when alerting is enabled.",
            });
            return;
          }

          alertPolicy = next;
          jsonResponse(res, 200, { configPath: alertConfigPath, policy: alertPolicy });
        });
      }
      methodNotAllowed(res);
      return;
    }

    if (webhookCrudEnabled && url.pathname === "/api/alerts/test-webhook") {
      if (req.method !== "POST") {
        methodNotAllowed(res);
        return;
      }
      return Promise.resolve(readJsonBody(req)).then((body) => {
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          jsonResponse(res, 400, { error: "Test webhook payload must be a JSON object." });
          return;
        }
        for (const key of Object.keys(body)) {
          if (key !== "webhookUrl") {
            jsonResponse(res, 400, {
              error: `Test webhook payload includes unsupported field "${key}".`,
            });
            return;
          }
        }

        let targetUrl = alertPolicy.webhookUrl;
        if (Object.hasOwn(body, "webhookUrl")) {
          if (body.webhookUrl === null) {
            targetUrl = "";
          } else if (typeof body.webhookUrl === "string") {
            targetUrl = body.webhookUrl.trim();
          } else {
            jsonResponse(res, 400, { error: "webhookUrl must be a string or null." });
            return;
          }
        }

        if (!targetUrl) {
          jsonResponse(res, 400, { error: "No webhook URL is configured." });
          return;
        }

        jsonResponse(res, 200, {
          ok: true,
          sentAt: new Date().toISOString(),
          targetUrl,
        });
      });
    }

    if (url.pathname === "/openapi.json") {
      if (req.method !== "GET") {
        methodNotAllowed(res);
        return;
      }
      jsonResponse(res, 200, buildOpenApiDocument({ enableWebhookCrud: webhookCrudEnabled }));
      return;
    }

    notFound(res);
  }, port);

  return {
    origin: started.origin,
    close: started.close,
    requests,
    setWebhookCrudEnabled: (enabled) => {
      webhookCrudEnabled = Boolean(enabled);
    },
  };
}

export async function startConfigServer(apiOrigin: string, port = 0): Promise<StartedServer> {
  const started = await startServer((req, res) => {
    if (req.method !== "GET") {
      jsonResponse(res, 405, { error: "Method not allowed" });
      return;
    }
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (url.pathname === "/config.json") {
      jsonResponse(res, 200, { apiOrigin });
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end("<!doctype html><html><body>fixture config server</body></html>");
      return;
    }
    notFound(res);
  }, port);

  return {
    origin: started.origin,
    close: started.close,
  };
}
