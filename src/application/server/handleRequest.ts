import { statfsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

import { json, readJsonBody, setCorsHeaders } from "../../infrastructure/frameworks/http.js";
import type { LogAggregateGroupBy, LogQueryOptions } from "../../interfaces/index.js";
import type { RequestContext } from "../../server.js";
import { parseAlertPolicyUpdate } from "../../usecases/alerting.js";
import { isApiAuthorized, resolveIngestProducerId } from "../../usecases/auth.js";
import {
  enqueueIngestQueueBatch,
  flushIngestQueueBatch,
  normalizeIngestRecord,
  parseIngestPayload,
} from "../../usecases/ingest.js";

const MAX_QUERY_LIMIT = 1_000;

function toNumber(value: string | null, fallback: number, max?: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  if (typeof max === "number") {
    return Math.min(max, parsed);
  }
  return parsed;
}

function asNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
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

export async function handleRequest(
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
    const alertState = context.alerts.getState();
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
        alerting: alertState,
        alertPolicy: context.alerts.getMaskedPolicy(),
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

  if (requestUrl.pathname === "/api/alerts/config" && req.method === "GET") {
    return json(
      req,
      res,
      200,
      {
        configPath: context.alerts.getConfigPath(),
        policy: context.alerts.getPolicy(),
      },
      context.corsAllowOrigins,
    );
  }

  if (requestUrl.pathname === "/api/alerts/config" && req.method === "PUT") {
    let payload: unknown;
    try {
      payload = await readJsonBody(req, context.ingestAuthPolicy.maxBodyBytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.startsWith("Payload too large") ? 413 : 400;
      return json(req, res, status, { error: message }, context.corsAllowOrigins);
    }

    let update: ReturnType<typeof parseAlertPolicyUpdate>;
    try {
      update = parseAlertPolicyUpdate(payload);
    } catch (error) {
      return json(
        req,
        res,
        400,
        { error: error instanceof Error ? error.message : String(error) },
        context.corsAllowOrigins,
      );
    }

    try {
      const policy = context.alerts.updatePolicy(update);
      return json(
        req,
        res,
        200,
        {
          configPath: context.alerts.getConfigPath(),
          policy,
        },
        context.corsAllowOrigins,
      );
    } catch (error) {
      return json(
        req,
        res,
        400,
        { error: error instanceof Error ? error.message : String(error) },
        context.corsAllowOrigins,
      );
    }
  }

  if (requestUrl.pathname === "/api/alerts/test-webhook" && req.method === "POST") {
    let payload: unknown;
    try {
      payload = await readJsonBody(req, context.ingestAuthPolicy.maxBodyBytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.startsWith("Payload too large") ? 413 : 400;
      return json(req, res, status, { error: message }, context.corsAllowOrigins);
    }

    if (Array.isArray(payload) && payload.length === 0) {
      payload = {};
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json(
        req,
        res,
        400,
        { error: "Test webhook payload must be a JSON object." },
        context.corsAllowOrigins,
      );
    }

    const body = payload as Record<string, unknown>;
    for (const key of Object.keys(body)) {
      if (key !== "webhookUrl") {
        return json(
          req,
          res,
          400,
          { error: `Test webhook payload includes unsupported field "${key}".` },
          context.corsAllowOrigins,
        );
      }
    }

    let webhookUrlOverride: string | undefined;
    if (Object.hasOwn(body, "webhookUrl")) {
      if (body.webhookUrl === null) {
        webhookUrlOverride = undefined;
      } else if (typeof body.webhookUrl === "string") {
        webhookUrlOverride = body.webhookUrl;
      } else {
        return json(
          req,
          res,
          400,
          { error: "webhookUrl must be a string or null." },
          context.corsAllowOrigins,
        );
      }
    }

    try {
      const result = await context.alerts.testWebhook(webhookUrlOverride);
      return json(
        req,
        res,
        200,
        {
          ok: true,
          ...result,
        },
        context.corsAllowOrigins,
      );
    } catch (error) {
      return json(
        req,
        res,
        400,
        { error: error instanceof Error ? error.message : String(error) },
        context.corsAllowOrigins,
      );
    }
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
