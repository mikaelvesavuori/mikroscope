import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startMikroScopeServer } from "../src/server.js";

type JsonResponse = {
  headers: Record<string, string | string[] | undefined>;
  statusCode: number;
  body: unknown;
};

type TextResponse = {
  headers: Record<string, string | string[] | undefined>;
  statusCode: number;
  body: string;
};

function requestJson(
  url: URL,
  options: { body?: unknown; headers?: Record<string, string>; method?: string } = {},
) {
  const requester = url.protocol === "https:" ? httpsRequest : httpRequest;
  const body =
    options.body === undefined
      ? undefined
      : typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  const headers = { ...(options.headers || {}) };
  if (body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["content-type"] = "application/json";
  }

  return new Promise<JsonResponse>((resolve, reject) => {
    const req = requester(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: options.method || "GET",
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown = {};
          if (text.length > 0) {
            parsed = JSON.parse(text);
          }
          resolve({
            headers: res.headers,
            statusCode: res.statusCode || 0,
            body: parsed,
          });
        });
      },
    );

    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function requestText(
  url: URL,
  options: { body?: unknown; headers?: Record<string, string>; method?: string } = {},
) {
  const requester = url.protocol === "https:" ? httpsRequest : httpRequest;
  const body =
    options.body === undefined
      ? undefined
      : typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  const headers = { ...(options.headers || {}) };
  if (
    body !== undefined &&
    !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")
  ) {
    headers["content-type"] = "application/json";
  }

  return new Promise<TextResponse>((resolve, reject) => {
    const req = requester(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: options.method || "GET",
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          resolve({
            headers: res.headers,
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asBasicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

const cleanupPaths: string[] = [];

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (!path) continue;
    await rm(path, { recursive: true, force: true });
  }
});

describe("MikroScope API sidecar", () => {
  it("serves OpenAPI spec and Scalar docs", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-docs-"));
    cleanupPaths.push(tempRoot);

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: join(tempRoot, "logs"),
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const spec = await requestText(new URL("/openapi.yaml", running.url));
      expect(spec.statusCode).toBe(200);
      expect(spec.headers["content-type"]).toContain("application/yaml");
      expect(spec.body).toContain("openapi: 3.1.0");
      expect(spec.body).toContain("/api/ingest");

      const specJson = await requestText(new URL("/openapi.json", running.url));
      expect(specJson.statusCode).toBe(200);
      expect(specJson.headers["content-type"]).toContain("application/json");
      expect(specJson.body).toContain('"openapi": "3.1.0"');
      expect(specJson.body).toContain("/api/ingest");

      const docs = await requestText(new URL("/docs", running.url));
      expect(docs.statusCode).toBe(200);
      expect(docs.headers["content-type"]).toContain("text/html");
      expect(docs.body).toContain("@scalar/api-reference");
      expect(docs.body).toContain('id="app"');
      expect(docs.body).toContain("Scalar.createApiReference");
      expect(docs.body).toContain("/openapi.json");

      const docsSlash = await requestText(new URL("/docs/", running.url));
      expect(docsSlash.statusCode).toBe(200);
      expect(docsSlash.headers["content-type"]).toContain("text/html");
    } finally {
      await running.close();
    }
  });

  it("serves health and protects API endpoints with bearer token", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-test-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      `${JSON.stringify({
        timestamp: "2026-02-17T11:15:00.000Z",
        level: "INFO",
        event: "order.created",
        message: "order.created",
        customerId: "CUST-42",
      })}\n`,
      "utf8",
    );

    const running = await startMikroScopeServer({
      apiToken: "secret-token",
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const health = await requestJson(new URL("/health", running.url));
      expect(health.statusCode).toBe(200);
      const healthBody = health.body as {
        maintenance: { runs: number };
        ok: boolean;
        service: string;
        storage: { minFreeBytes: number };
      };
      expect(healthBody.ok).toBe(true);
      expect(healthBody.service).toBe("mikroscope");
      expect(healthBody.maintenance.runs).toBeGreaterThan(0);
      expect(healthBody.storage.minFreeBytes).toBeGreaterThan(0);
      expect(health.headers["access-control-allow-origin"]).toBe("*");

      const preflight = await requestJson(new URL("/api/logs", running.url), {
        headers: {
          "access-control-request-headers": "authorization",
          "access-control-request-method": "GET",
          origin: "http://127.0.0.1:4320",
        },
        method: "OPTIONS",
      });
      expect(preflight.statusCode).toBe(204);
      expect(preflight.headers["access-control-allow-origin"]).toBe("*");

      const unauthorized = await requestJson(new URL("/api/logs?limit=5", running.url));
      expect(unauthorized.statusCode).toBe(401);

      const authorized = await requestJson(new URL("/api/logs?limit=5", running.url), {
        headers: { authorization: "Bearer secret-token" },
      });
      expect(authorized.statusCode).toBe(200);
      const authorizedBody = authorized.body as {
        entries: Array<{ event: string }>;
        hasMore: boolean;
        limit: number;
        nextCursor?: string;
      };
      expect(Array.isArray(authorizedBody.entries)).toBe(true);
      expect(authorizedBody.entries[0].event).toBe("order.created");
      expect(authorizedBody.hasMore).toBe(false);
      expect(authorizedBody.limit).toBe(5);

      const reindex = await requestJson(new URL("/api/reindex", running.url), {
        headers: { authorization: "Bearer secret-token" },
        method: "POST",
      });
      expect(reindex.statusCode).toBe(200);
    } finally {
      await running.close();
    }
  });

  it("ingests payloads using producer-bound tokens and overrides producerId", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-ingest-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });

    const running = await startMikroScopeServer({
      apiToken: "query-token",
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      ingestProducers: "ingest-token=frontend-web",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const ingest = await requestJson(new URL("/api/ingest", running.url), {
        body: [
          {
            event: "frontend.click",
            level: "INFO",
            message: "frontend.click",
            producerId: "spoofed-producer",
            timestamp: "2026-02-18T10:00:00.000Z",
          },
          "invalid-record",
        ],
        headers: { authorization: "Bearer ingest-token" },
        method: "POST",
      });
      expect(ingest.statusCode).toBe(200);
      const ingestBody = ingest.body as {
        accepted: number;
        producerId: string;
        receivedAt: string;
        rejected: number;
      };
      expect(ingestBody.accepted).toBe(1);
      expect(ingestBody.rejected).toBe(1);
      expect(ingestBody.producerId).toBe("frontend-web");
      expect(typeof ingestBody.receivedAt).toBe("string");

      const queryHeaders = { authorization: "Bearer query-token" };
      const byProducer = await requestJson(
        new URL("/api/logs?field=producerId&value=frontend-web&limit=10", running.url),
        { headers: queryHeaders },
      );
      expect(byProducer.statusCode).toBe(200);
      const byProducerBody = byProducer.body as {
        entries: Array<{ data: { producerId?: string }; event: string }>;
      };
      expect(byProducerBody.entries.length).toBe(1);
      expect(byProducerBody.entries[0].event).toBe("frontend.click");
      expect(byProducerBody.entries[0].data.producerId).toBe("frontend-web");

      const spoofed = await requestJson(
        new URL("/api/logs?field=producerId&value=spoofed-producer&limit=10", running.url),
        { headers: queryHeaders },
      );
      expect(spoofed.statusCode).toBe(200);
      const spoofedBody = spoofed.body as { entries: unknown[] };
      expect(spoofedBody.entries.length).toBe(0);
    } finally {
      await running.close();
    }
  });

  it("supports simple username/password basic auth for API routes", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-basic-auth-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      `${JSON.stringify({
        timestamp: "2026-02-17T11:15:00.000Z",
        level: "INFO",
        event: "order.created",
        message: "order.created",
      })}\n`,
      "utf8",
    );

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      authPassword: "secret-password",
      authUsername: "mikroscope",
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const unauthorized = await requestJson(new URL("/api/logs?limit=5", running.url));
      expect(unauthorized.statusCode).toBe(401);

      const invalid = await requestJson(new URL("/api/logs?limit=5", running.url), {
        headers: { authorization: asBasicAuth("mikroscope", "wrong") },
      });
      expect(invalid.statusCode).toBe(401);

      const authorized = await requestJson(new URL("/api/logs?limit=5", running.url), {
        headers: { authorization: asBasicAuth("mikroscope", "secret-password") },
      });
      expect(authorized.statusCode).toBe(200);
      const body = authorized.body as { entries: Array<{ event: string }> };
      expect(body.entries.length).toBe(1);
      expect(body.entries[0].event).toBe("order.created");
    } finally {
      await running.close();
    }
  });

  it("rejects ingest requests without a valid producer token", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-ingest-auth-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      ingestProducers: "token-a=backend-api",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const missingToken = await requestJson(new URL("/api/ingest", running.url), {
        body: [],
        method: "POST",
      });
      expect(missingToken.statusCode).toBe(401);

      const invalidToken = await requestJson(new URL("/api/ingest", running.url), {
        body: [],
        headers: { authorization: "Bearer token-b" },
        method: "POST",
      });
      expect(invalidToken.statusCode).toBe(401);
    } finally {
      await running.close();
    }
  });

  it("accepts ingest wrapper payloads with logs array", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-ingest-wrapper-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });

    const running = await startMikroScopeServer({
      apiToken: "query-token",
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      ingestProducers: "token-a=frontend-web",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const ingest = await requestJson(new URL("/api/ingest", running.url), {
        body: {
          logs: [
            {
              event: "frontend.pageview",
              level: "INFO",
              message: "frontend.pageview",
              timestamp: "2026-02-18T12:10:00.000Z",
            },
          ],
        },
        headers: { authorization: "Bearer token-a" },
        method: "POST",
      });
      expect(ingest.statusCode).toBe(200);
      const ingestBody = ingest.body as { accepted: number; queued: boolean; rejected: number };
      expect(ingestBody.accepted).toBe(1);
      expect(ingestBody.rejected).toBe(0);
      expect(ingestBody.queued).toBe(false);

      const query = await requestJson(
        new URL("/api/logs?field=producerId&value=frontend-web&limit=10", running.url),
        { headers: { authorization: "Bearer query-token" } },
      );
      expect(query.statusCode).toBe(200);
      const queryBody = query.body as { entries: Array<{ event: string }> };
      expect(queryBody.entries.length).toBe(1);
      expect(queryBody.entries[0].event).toBe("frontend.pageview");
    } finally {
      await running.close();
    }
  });

  it("rejects ingest payloads larger than configured body size", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-ingest-max-body-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      ingestMaxBodyBytes: 64,
      ingestProducers: "token-a=frontend-web",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const response = await requestJson(new URL("/api/ingest", running.url), {
        body: [
          {
            event: "frontend.pageview",
            level: "INFO",
            message: "x".repeat(3_000),
            timestamp: "2026-02-18T12:12:00.000Z",
          },
        ],
        headers: { authorization: "Bearer token-a" },
        method: "POST",
      });
      expect(response.statusCode).toBe(413);
      const body = response.body as { error: string };
      expect(body.error).toContain("Payload too large");
    } finally {
      await running.close();
    }
  });

  it("rejects invalid ingest JSON payloads", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-ingest-invalid-json-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      ingestProducers: "token-a=frontend-web",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const response = await requestJson(new URL("/api/ingest", running.url), {
        body: "{\"logs\":[",
        headers: { authorization: "Bearer token-a" },
        method: "POST",
      });
      expect(response.statusCode).toBe(400);
      const body = response.body as { error: string };
      expect(body.error).toContain("Invalid JSON payload");
    } finally {
      await running.close();
    }
  });

  it("returns 404 for ingest when ingest producers are not configured", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-ingest-disabled-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const response = await requestJson(new URL("/api/ingest", running.url), {
        body: [],
        headers: { authorization: "Bearer token-a" },
        method: "POST",
      });
      expect(response.statusCode).toBe(404);
      const body = response.body as { error: string };
      expect(body.error).toContain("not enabled");
    } finally {
      await running.close();
    }
  });

  it("uses basic auth username as ingest producerId", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-ingest-basic-producer-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      authPassword: "secret-password",
      authUsername: "frontend-web",
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const ingest = await requestJson(new URL("/api/ingest", running.url), {
        body: [
          {
            event: "frontend.basic-auth-ingest",
            level: "INFO",
            message: "hello",
            producerId: "spoofed",
            timestamp: "2026-02-18T15:00:00.000Z",
          },
        ],
        headers: { authorization: asBasicAuth("frontend-web", "secret-password") },
        method: "POST",
      });
      expect(ingest.statusCode).toBe(200);
      const ingestBody = ingest.body as { producerId: string; queued: boolean };
      expect(ingestBody.producerId).toBe("frontend-web");
      expect(ingestBody.queued).toBe(false);

      const query = await requestJson(
        new URL("/api/logs?field=producerId&value=frontend-web&limit=10", running.url),
        { headers: { authorization: asBasicAuth("frontend-web", "secret-password") } },
      );
      expect(query.statusCode).toBe(200);
      const queryBody = query.body as { entries: Array<{ event: string }> };
      expect(queryBody.entries.some((entry) => entry.event === "frontend.basic-auth-ingest")).toBe(
        true,
      );
    } finally {
      await running.close();
    }
  });

  it("queues ingest writes and indexing when async queue mode is enabled", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-ingest-queue-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });

    const running = await startMikroScopeServer({
      apiToken: "query-token",
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      disableAutoIngest: true,
      host: "127.0.0.1",
      ingestAsyncQueue: true,
      ingestProducers: "token-a=frontend-web",
      ingestQueueFlushMs: 5,
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const ingest = await requestJson(new URL("/api/ingest", running.url), {
        body: [
          {
            event: "frontend.queue-test",
            level: "INFO",
            message: "queued",
            timestamp: "2026-02-18T12:14:00.000Z",
          },
        ],
        headers: { authorization: "Bearer token-a" },
        method: "POST",
      });
      expect(ingest.statusCode).toBe(202);
      const ingestBody = ingest.body as { accepted: number; queued: boolean; rejected: number };
      expect(ingestBody.accepted).toBe(1);
      expect(ingestBody.rejected).toBe(0);
      expect(ingestBody.queued).toBe(true);

      let seen = false;
      for (let i = 0; i < 40; i++) {
        const query = await requestJson(
          new URL("/api/logs?field=producerId&value=frontend-web&limit=10", running.url),
          { headers: { authorization: "Bearer query-token" } },
        );
        expect(query.statusCode).toBe(200);
        const queryBody = query.body as { entries: Array<{ event: string }> };
        seen = queryBody.entries.some((entry) => entry.event === "frontend.queue-test");
        if (seen) break;
        await wait(25);
      }
      expect(seen).toBe(true);
    } finally {
      await running.close();
    }
  });

  it("supports cursor pagination and aggregate queries", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-pagination-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      [
        JSON.stringify({
          timestamp: "2026-02-17T11:15:00.000Z",
          level: "INFO",
          event: "order.created",
          message: "order.created",
          customerId: "CUST-1",
          correlationId: "CORR-1",
          requestId: "REQ-1",
        }),
        JSON.stringify({
          timestamp: "2026-02-17T11:16:00.000Z",
          level: "ERROR",
          event: "order.failed",
          message: "order.failed",
          customerId: "CUST-1",
          correlationId: "CORR-1",
          requestId: "REQ-2",
        }),
        JSON.stringify({
          timestamp: "2026-02-17T11:17:00.000Z",
          level: "ERROR",
          event: "order.failed",
          message: "order.failed",
          customerId: "CUST-2",
          requestId: "REQ-3",
        }),
      ].join("\n"),
      "utf8",
    );

    const running = await startMikroScopeServer({
      apiToken: "secret-token",
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const headers = { authorization: "Bearer secret-token" };
      const firstPage = await requestJson(new URL("/api/logs?limit=1", running.url), { headers });
      expect(firstPage.statusCode).toBe(200);
      const firstBody = firstPage.body as {
        entries: Array<{ id: number }>;
        hasMore: boolean;
        limit: number;
        nextCursor?: string;
      };
      expect(firstBody.entries.length).toBe(1);
      expect(firstBody.hasMore).toBe(true);
      expect(typeof firstBody.nextCursor).toBe("string");

      const secondPage = await requestJson(
        new URL(`/api/logs?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor || "")}`, running.url),
        { headers },
      );
      expect(secondPage.statusCode).toBe(200);
      const secondBody = secondPage.body as { entries: Array<{ id: number }> };
      expect(secondBody.entries.length).toBe(1);
      expect(secondBody.entries[0].id).not.toBe(firstBody.entries[0].id);

      const byLevel = await requestJson(new URL("/api/logs/aggregate?groupBy=level", running.url), { headers });
      expect(byLevel.statusCode).toBe(200);
      const byLevelBody = byLevel.body as { buckets: Array<{ count: number; key: string }> };
      const errorBucket = byLevelBody.buckets.find((bucket) => bucket.key === "ERROR");
      expect(errorBucket?.count).toBe(2);

      const byCustomer = await requestJson(
        new URL("/api/logs/aggregate?groupBy=field&groupField=customerId", running.url),
        { headers },
      );
      expect(byCustomer.statusCode).toBe(200);
      const byCustomerBody = byCustomer.body as { buckets: Array<{ count: number; key: string }> };
      const customerOne = byCustomerBody.buckets.find((bucket) => bucket.key === "CUST-1");
      expect(customerOne?.count).toBe(2);

      const byCorrelation = await requestJson(new URL("/api/logs/aggregate?groupBy=correlation", running.url), {
        headers,
      });
      expect(byCorrelation.statusCode).toBe(200);
      const byCorrelationBody = byCorrelation.body as { buckets: Array<{ count: number; key: string }> };
      const corrOne = byCorrelationBody.buckets.find((bucket) => bucket.key === "CORR-1");
      const reqThree = byCorrelationBody.buckets.find((bucket) => bucket.key === "REQ-3");
      expect(corrOne?.count).toBe(2);
      expect(reqThree?.count).toBe(1);
    } finally {
      await running.close();
    }
  });

  it("caps API query limit to 1000", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-limit-cap-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      `${JSON.stringify({
        timestamp: "2026-02-17T11:15:00.000Z",
        level: "INFO",
        event: "order.created",
        message: "order.created",
      })}\n`,
      "utf8",
    );

    const running = await startMikroScopeServer({
      apiToken: "secret-token",
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const response = await requestJson(new URL("/api/logs?limit=99999", running.url), {
        headers: { authorization: "Bearer secret-token" },
      });
      expect(response.statusCode).toBe(200);
      const body = response.body as { entries: unknown[]; limit: number };
      expect(body.limit).toBe(1000);
      expect(body.entries.length).toBe(1);
    } finally {
      await running.close();
    }
  });

  it("reindex endpoint replaces stale entries with current log files", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-reindex-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    const logFile = join(logsDir, "orderbutler.ndjson");
    await writeFile(
      logFile,
      `${JSON.stringify({
        timestamp: "2026-02-17T11:15:00.000Z",
        level: "INFO",
        event: "event.one",
        message: "event.one",
      })}\n`,
      "utf8",
    );

    const running = await startMikroScopeServer({
      apiToken: "secret-token",
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const headers = { authorization: "Bearer secret-token" };
      const before = await requestJson(new URL("/api/logs?limit=10", running.url), { headers });
      expect(before.statusCode).toBe(200);
      const beforeBody = before.body as { entries: Array<{ event: string }> };
      expect(beforeBody.entries.length).toBe(1);
      expect(beforeBody.entries[0].event).toBe("event.one");

      await writeFile(
        logFile,
        `${JSON.stringify({
          timestamp: "2026-02-17T11:16:00.000Z",
          level: "INFO",
          event: "event.two",
          message: "event.two",
        })}\n`,
        "utf8",
      );

      const reindex = await requestJson(new URL("/api/reindex", running.url), {
        headers,
        method: "POST",
      });
      expect(reindex.statusCode).toBe(200);
      const reindexBody = reindex.body as { reset: { entriesDeleted: number; fieldsDeleted: number } };
      expect(reindexBody.reset.entriesDeleted).toBeGreaterThan(0);
      expect(reindexBody.reset.fieldsDeleted).toBeGreaterThanOrEqual(0);

      const after = await requestJson(new URL("/api/logs?limit=10", running.url), { headers });
      expect(after.statusCode).toBe(200);
      const afterBody = after.body as { entries: Array<{ event: string }> };
      expect(afterBody.entries.length).toBe(1);
      expect(afterBody.entries[0].event).toBe("event.two");
    } finally {
      await running.close();
    }
  });

  it("updates alert config remotely, persists it, and reloads it on restart", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-alert-config-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    const dbPath = join(tempRoot, "mikroscope.db");
    const configPath = join(tempRoot, "mikroscope.alert-config.json");

    const webhookServer = createServer((_req, res) => {
      res.statusCode = 204;
      res.end();
    });
    const webhookUrl = await new Promise<string>((resolve, reject) => {
      webhookServer.once("error", reject);
      webhookServer.listen(0, "127.0.0.1", () => {
        const address = webhookServer.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to bind webhook server"));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}/webhook`);
      });
    });

    const running = await startMikroScopeServer({
      apiToken: "secret-token",
      attachSignalHandlers: false,
      dbPath,
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const unauthorized = await requestJson(new URL("/api/alerts/config", running.url));
      expect(unauthorized.statusCode).toBe(401);

      const updateResponse = await requestJson(new URL("/api/alerts/config", running.url), {
        body: {
          enabled: true,
          webhookUrl,
          intervalMs: 1_500,
          windowMinutes: 7,
          errorThreshold: 9_999,
          noLogsThresholdMinutes: 0,
          cooldownMs: 5_000,
          webhookTimeoutMs: 1_000,
          webhookRetryAttempts: 2,
          webhookBackoffMs: 100,
        },
        headers: { authorization: "Bearer secret-token" },
        method: "PUT",
      });
      expect(updateResponse.statusCode).toBe(200);
      const updateBody = updateResponse.body as {
        configPath: string;
        policy: { intervalMs: number; webhookUrl?: string; windowMinutes: number };
      };
      expect(updateBody.configPath).toBe(configPath);
      expect(updateBody.policy.webhookUrl).toBe(webhookUrl);
      expect(updateBody.policy.intervalMs).toBe(1_500);
      expect(updateBody.policy.windowMinutes).toBe(7);

      const persistedRaw = await readFile(configPath, "utf8");
      const persisted = JSON.parse(persistedRaw) as {
        intervalMs: number;
        webhookUrl?: string;
        windowMinutes: number;
      };
      expect(persisted.webhookUrl).toBe(webhookUrl);
      expect(persisted.intervalMs).toBe(1_500);
      expect(persisted.windowMinutes).toBe(7);

      const health = await requestJson(new URL("/health", running.url));
      expect(health.statusCode).toBe(200);
      const healthBody = health.body as { alertPolicy: { webhookUrl?: string } };
      expect(healthBody.alertPolicy.webhookUrl).toBe("[configured]");
    } finally {
      await running.close();
    }

    const restarted = await startMikroScopeServer({
      apiToken: "secret-token",
      attachSignalHandlers: false,
      alertIntervalMs: 30_000,
      alertWebhookUrl: "",
      dbPath,
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const config = await requestJson(new URL("/api/alerts/config", restarted.url), {
        headers: { authorization: "Bearer secret-token" },
      });
      expect(config.statusCode).toBe(200);
      const configBody = config.body as {
        configPath: string;
        policy: { enabled: boolean; intervalMs: number; webhookUrl?: string; windowMinutes: number };
      };
      expect(configBody.configPath).toBe(configPath);
      expect(configBody.policy.enabled).toBe(true);
      expect(configBody.policy.webhookUrl).toBe(webhookUrl);
      expect(configBody.policy.intervalMs).toBe(1_500);
      expect(configBody.policy.windowMinutes).toBe(7);
    } finally {
      await restarted.close();
      await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
    }
  });

  it("sends manual webhook test events via API", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-alert-test-webhook-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });

    const received: Array<{ details?: { message?: string }; rule?: string; source?: string }> = [];
    const webhookServer = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          details?: { message?: string };
          rule?: string;
          source?: string;
        };
        received.push(parsed);
        res.statusCode = 204;
        res.end();
      });
    });
    const webhookUrl = await new Promise<string>((resolve, reject) => {
      webhookServer.once("error", reject);
      webhookServer.listen(0, "127.0.0.1", () => {
        const address = webhookServer.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to bind webhook server"));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}/webhook`);
      });
    });

    const running = await startMikroScopeServer({
      apiToken: "secret-token",
      attachSignalHandlers: false,
      alertWebhookUrl: webhookUrl,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const response = await requestJson(new URL("/api/alerts/test-webhook", running.url), {
        body: {},
        headers: { authorization: "Bearer secret-token" },
        method: "POST",
      });
      expect(response.statusCode).toBe(200);
      const body = response.body as { ok: boolean; sentAt: string; targetUrl: string };
      expect(body.ok).toBe(true);
      expect(body.targetUrl).toBe(webhookUrl);
      expect(typeof body.sentAt).toBe("string");

      for (let i = 0; i < 20 && received.length === 0; i++) {
        await wait(25);
      }
      expect(received.length).toBe(1);
      expect(received[0].source).toBe("mikroscope");
      expect(received[0].rule).toBe("manual_test");
      expect(received[0].details?.message).toContain("Manual webhook test");
    } finally {
      await running.close();
      await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
    }
  });

  it("sends webhook alerts when thresholds are breached", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-alerts-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    const now = Date.now();
    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      [
        JSON.stringify({
          timestamp: new Date(now - 30_000).toISOString(),
          level: "ERROR",
          event: "order.failed",
          message: "order.failed",
        }),
        JSON.stringify({
          timestamp: new Date(now - 10_000).toISOString(),
          level: "ERROR",
          event: "order.failed",
          message: "order.failed",
        }),
      ].join("\n"),
      "utf8",
    );

    const received: Array<{ rule?: string; source?: string }> = [];
    const webhookServer = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        received.push(JSON.parse(text) as { rule?: string; source?: string });
        res.statusCode = 204;
        res.end();
      });
    });

    const webhookUrl = await new Promise<string>((resolve, reject) => {
      webhookServer.once("error", reject);
      webhookServer.listen(0, "127.0.0.1", () => {
        const address = webhookServer.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to bind webhook server"));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}/webhook`);
      });
    });

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      alertCooldownMs: 10_000,
      alertErrorThreshold: 1,
      alertIntervalMs: 50,
      alertWebhookUrl: webhookUrl,
      alertWindowMinutes: 60,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      for (let i = 0; i < 40 && received.length === 0; i++) {
        await wait(50);
      }
      expect(received.length).toBeGreaterThan(0);
      expect(received[0].source).toBe("mikroscope");
      expect(received[0].rule).toBe("error_threshold");
    } finally {
      await running.close();
      await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
    }
  });

  it("retries webhook alerts for retryable responses", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-alert-retryable-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    const now = Date.now();
    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      `${JSON.stringify({
        timestamp: new Date(now - 20_000).toISOString(),
        level: "ERROR",
        event: "order.failed",
        message: "order.failed",
      })}\n`,
      "utf8",
    );

    let callCount = 0;
    const webhookServer = createServer((_req, res) => {
      callCount++;
      res.statusCode = callCount < 3 ? 500 : 204;
      res.end(callCount < 3 ? "retry" : "");
    });

    const webhookUrl = await new Promise<string>((resolve, reject) => {
      webhookServer.once("error", reject);
      webhookServer.listen(0, "127.0.0.1", () => {
        const address = webhookServer.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to bind webhook server"));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}/webhook`);
      });
    });

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      alertCooldownMs: 60_000,
      alertErrorThreshold: 1,
      alertIntervalMs: 10_000,
      alertWebhookBackoffMs: 5,
      alertWebhookRetryAttempts: 3,
      alertWebhookTimeoutMs: 1_000,
      alertWebhookUrl: webhookUrl,
      alertWindowMinutes: 60,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      for (let i = 0; i < 80 && callCount < 3; i++) {
        await wait(25);
      }
      expect(callCount).toBe(3);
    } finally {
      await running.close();
      await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
    }
  });

  it("does not retry webhook alerts for non-retryable responses", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-alert-nonretryable-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    const now = Date.now();
    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      `${JSON.stringify({
        timestamp: new Date(now - 20_000).toISOString(),
        level: "ERROR",
        event: "order.failed",
        message: "order.failed",
      })}\n`,
      "utf8",
    );

    let callCount = 0;
    const webhookServer = createServer((_req, res) => {
      callCount++;
      res.statusCode = 400;
      res.end("bad request");
    });

    const webhookUrl = await new Promise<string>((resolve, reject) => {
      webhookServer.once("error", reject);
      webhookServer.listen(0, "127.0.0.1", () => {
        const address = webhookServer.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to bind webhook server"));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}/webhook`);
      });
    });

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      alertCooldownMs: 60_000,
      alertErrorThreshold: 1,
      alertIntervalMs: 10_000,
      alertWebhookBackoffMs: 5,
      alertWebhookRetryAttempts: 4,
      alertWebhookTimeoutMs: 1_000,
      alertWebhookUrl: webhookUrl,
      alertWindowMinutes: 60,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      for (let i = 0; i < 80 && callCount === 0; i++) {
        await wait(25);
      }
      expect(callCount).toBe(1);
      await wait(120);
      expect(callCount).toBe(1);
    } finally {
      await running.close();
      await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
    }
  });

  it("validates aggregate parameters and tolerates malformed cursors", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-validate-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      `${JSON.stringify({
        timestamp: "2026-02-17T11:15:00.000Z",
        level: "INFO",
        event: "order.created",
        message: "order.created",
        customerId: "CUST-42",
      })}\n`,
      "utf8",
    );

    const running = await startMikroScopeServer({
      apiToken: "secret-token",
      attachSignalHandlers: false,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const headers = { authorization: "Bearer secret-token" };

      const malformedCursor = await requestJson(new URL("/api/logs?limit=1&cursor=not-base64", running.url), {
        headers,
      });
      expect(malformedCursor.statusCode).toBe(200);
      const malformedCursorBody = malformedCursor.body as { entries: Array<{ event: string }> };
      expect(malformedCursorBody.entries.length).toBe(1);
      expect(malformedCursorBody.entries[0].event).toBe("order.created");

      const invalidGroupBy = await requestJson(new URL("/api/logs/aggregate?groupBy=invalid", running.url), {
        headers,
      });
      expect(invalidGroupBy.statusCode).toBe(400);

      const missingGroupField = await requestJson(new URL("/api/logs/aggregate?groupBy=field", running.url), {
        headers,
      });
      expect(missingGroupField.statusCode).toBe(400);
      const missingFieldBody = missingGroupField.body as { error: string };
      expect(missingFieldBody.error).toContain("groupField");
    } finally {
      await running.close();
    }
  });

  it("applies explicit CORS allow-list entries and omits unmatched origins", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-cors-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      `${JSON.stringify({
        timestamp: "2026-02-17T11:15:00.000Z",
        level: "INFO",
        event: "order.created",
        message: "order.created",
      })}\n`,
      "utf8",
    );

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      corsAllowOrigin: "http://allowed.example,http://second.example",
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      const allowed = await requestJson(new URL("/health", running.url), {
        headers: { origin: "http://allowed.example" },
      });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.headers["access-control-allow-origin"]).toBe("http://allowed.example");
      expect(allowed.headers.vary).toBe("Origin");

      const denied = await requestJson(new URL("/health", running.url), {
        headers: { origin: "http://denied.example" },
      });
      expect(denied.statusCode).toBe(200);
      expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await running.close();
    }
  });

  it("suppresses repeated alerts during cooldown windows", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-alert-cooldown-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    const now = Date.now();
    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      [
        JSON.stringify({
          timestamp: new Date(now - 20_000).toISOString(),
          level: "ERROR",
          event: "order.failed",
          message: "order.failed",
        }),
        JSON.stringify({
          timestamp: new Date(now - 10_000).toISOString(),
          level: "ERROR",
          event: "order.failed",
          message: "order.failed",
        }),
      ].join("\n"),
      "utf8",
    );

    const received: Array<{ rule?: string; source?: string }> = [];
    const webhookServer = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        received.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as { rule?: string; source?: string });
        res.statusCode = 204;
        res.end();
      });
    });

    const webhookUrl = await new Promise<string>((resolve, reject) => {
      webhookServer.once("error", reject);
      webhookServer.listen(0, "127.0.0.1", () => {
        const address = webhookServer.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to bind webhook server"));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}/webhook`);
      });
    });

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      alertCooldownMs: 500,
      alertErrorThreshold: 1,
      alertIntervalMs: 40,
      alertWebhookUrl: webhookUrl,
      alertWindowMinutes: 60,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      for (let i = 0; i < 40 && received.length === 0; i++) {
        await wait(25);
      }
      expect(received.length).toBe(1);
      await wait(200);
      expect(received.length).toBe(1);
    } finally {
      await running.close();
      await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
    }
  });

  it("emits no-logs alerts when configured", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-api-alert-nologs-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });

    const received: Array<{ rule?: string; source?: string }> = [];
    const webhookServer = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        received.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as { rule?: string; source?: string });
        res.statusCode = 204;
        res.end();
      });
    });

    const webhookUrl = await new Promise<string>((resolve, reject) => {
      webhookServer.once("error", reject);
      webhookServer.listen(0, "127.0.0.1", () => {
        const address = webhookServer.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to bind webhook server"));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}/webhook`);
      });
    });

    const running = await startMikroScopeServer({
      attachSignalHandlers: false,
      alertCooldownMs: 1_000,
      alertErrorThreshold: 99_999,
      alertIntervalMs: 40,
      alertNoLogsThresholdMinutes: 1,
      alertWebhookUrl: webhookUrl,
      alertWindowMinutes: 5,
      dbPath: join(tempRoot, "mikroscope.db"),
      host: "127.0.0.1",
      logsPath: logsDir,
      minFreeBytes: 1,
      port: 0,
      protocol: "http",
    });

    try {
      for (let i = 0; i < 50 && received.length === 0; i++) {
        await wait(25);
      }
      expect(received.length).toBeGreaterThan(0);
      expect(received[0].source).toBe("mikroscope");
      expect(received[0].rule).toBe("no_logs");
    } finally {
      await running.close();
      await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
    }
  });
});
