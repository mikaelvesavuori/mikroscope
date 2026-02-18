#!/usr/bin/env tsx

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { LogQueryService } from "../../src/application/services/LogQueryService.js";
import { LogIndexer } from "../../src/infrastructure/indexing/LogIndexer.js";
import { LogDatabase } from "../../src/infrastructure/persistence/LogDatabase.js";
import { startMikroScopeServer } from "../../src/server.js";

type Metric = {
  scenario: string;
  metric: string;
  value: number;
  unit: "ms" | "count" | "rps" | "x";
};

type Distribution = {
  mean: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
};

type PerfConfig = {
  appendRecordCount: number;
  failOnBudget: boolean;
  fileCount: number;
  includeApi: boolean;
  logsPerFile: number;
  queryCount: number;
  seed: number;
  tenantCount: number;
};

type SeedResult = {
  firstTimestamp: string;
  lastTimestamp: string;
  recordsWritten: number;
  sampledCustomerIds: string[];
};

type JsonResponse = {
  body: unknown;
  statusCode: number;
};

const config: PerfConfig = {
  appendRecordCount: Number(process.env.PERF_MS_APPEND_RECORDS ?? 2500),
  failOnBudget: process.env.PERF_MS_FAIL_ON_BUDGET === "true",
  fileCount: Number(process.env.PERF_MS_FILE_COUNT ?? 80),
  includeApi: process.env.PERF_MS_INCLUDE_API !== "false",
  logsPerFile: Number(process.env.PERF_MS_LOGS_PER_FILE ?? 600),
  queryCount: Number(process.env.PERF_MS_QUERY_COUNT ?? 250),
  seed: Number(process.env.PERF_MS_SEED ?? 2402),
  tenantCount: Number(process.env.PERF_MS_TENANT_COUNT ?? 1200),
};

const budgets = {
  apiQueryP95Ms: Number(process.env.PERF_MS_BUDGET_API_QUERY_P95_MS ?? 35),
  coldThroughputRps: Number(process.env.PERF_MS_BUDGET_COLD_THROUGHPUT_RPS ?? 1200),
  directQueryP95Ms: Number(process.env.PERF_MS_BUDGET_DIRECT_QUERY_P95_MS ?? 15),
  fieldQueryP95Ms: Number(process.env.PERF_MS_BUDGET_FIELD_QUERY_P95_MS ?? 20),
  rangeQueryP95Ms: Number(process.env.PERF_MS_BUDGET_RANGE_QUERY_P95_MS ?? 25),
};

const levels = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
const events = [
  "order.created",
  "order.updated",
  "order.confirmed",
  "order.delivered",
  "supplier.orders.viewed",
  "matching.suggested",
  "ai.request.completed",
  "ingest.validation.failed",
];

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function distribution(values: number[]): Distribution {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p95: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const at = (pct: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * pct))];
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: total / values.length,
    p50: at(0.5),
    p95: at(0.95),
  };
}

function logProgress(label: string, current: number, total: number): void {
  if (total <= 0) return;
  const chunk = Math.max(1, Math.floor(total / 4));
  if (current === total || current % chunk === 0) {
    process.stdout.write(`  ${label}: ${current}/${total}\n`);
  }
}

function pickLevel(rng: () => number): string {
  const value = rng();
  if (value < 0.08) return levels[0];
  if (value < 0.75) return levels[1];
  if (value < 0.93) return levels[2];
  return levels[3];
}

function pickEvent(rng: () => number): string {
  return events[randomInt(rng, 0, events.length - 1)];
}

function createLogRecord(input: {
  customerId: string;
  index: number;
  level: string;
  timestamp: string;
  rng: () => number;
}): Record<string, string | number | boolean> {
  const event = pickEvent(input.rng);
  return {
    customerId: input.customerId,
    event,
    isRetry: input.rng() > 0.9,
    level: input.level,
    message: event,
    orderId: `ord-${pad((input.index % 600_000) + 1, 8)}`,
    requestId: `req-${pad(input.index + 1, 9)}`,
    retryCount: randomInt(input.rng, 0, 3),
    supplierId: `SUP-${pad((input.index % 2500) + 1, 4)}`,
    timestamp: input.timestamp,
  };
}

async function requestJson(url: URL, options: { headers?: Record<string, string>; method?: string } = {}) {
  return new Promise<JsonResponse>((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: url.hostname,
        method: options.method || "GET",
        path: `${url.pathname}${url.search}`,
        port: Number(url.port),
        protocol: url.protocol,
        headers: options.headers || {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let body: unknown = {};
          if (text.length > 0) body = JSON.parse(text);
          resolve({
            body,
            statusCode: res.statusCode || 0,
          });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

async function seedLogs(
  logsPath: string,
  fileCount: number,
  recordsPerFile: number,
  tenantIds: string[],
  rng: () => number,
): Promise<SeedResult> {
  const startMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
  let globalIndex = 0;
  let firstTimestamp = "";
  let lastTimestamp = "";
  const sampledCustomerIds = new Set<string>();

  for (let i = 0; i < fileCount; i++) {
    const nested = join(logsPath, `batch-${pad((i % 10) + 1, 2)}`);
    await mkdir(nested, { recursive: true });
    const filePath = join(nested, `orderbutler-${pad(i + 1, 5)}.ndjson`);
    const lines: string[] = [];

    for (let j = 0; j < recordsPerFile; j++) {
      const customerId = tenantIds[randomInt(rng, 0, tenantIds.length - 1)];
      const timestamp = new Date(startMs + globalIndex * 15_000 + randomInt(rng, 0, 5_000)).toISOString();
      const record = createLogRecord({
        customerId,
        index: globalIndex,
        level: pickLevel(rng),
        timestamp,
        rng,
      });
      lines.push(JSON.stringify(record));
      if (sampledCustomerIds.size < 250 && sampledCustomerIds.size % 3 === 0) {
        sampledCustomerIds.add(customerId);
      }
      if (globalIndex === 0) firstTimestamp = timestamp;
      lastTimestamp = timestamp;
      globalIndex++;
    }

    await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
    logProgress("Seed log files", i + 1, fileCount);
  }

  return {
    firstTimestamp,
    lastTimestamp,
    recordsWritten: globalIndex,
    sampledCustomerIds: [...sampledCustomerIds],
  };
}

async function appendLogs(
  logsPath: string,
  appendCount: number,
  tenantIds: string[],
  rng: () => number,
  startTimestampMs: number,
): Promise<number> {
  const appendDir = join(logsPath, "incremental");
  await mkdir(appendDir, { recursive: true });
  const filePath = join(appendDir, `append-${Date.now()}.ndjson`);
  const lines: string[] = [];

  for (let i = 0; i < appendCount; i++) {
    const timestamp = new Date(startTimestampMs + i * 5_000 + randomInt(rng, 0, 2_000)).toISOString();
    const customerId = tenantIds[randomInt(rng, 0, tenantIds.length - 1)];
    lines.push(
      JSON.stringify(
        createLogRecord({
          customerId,
          index: i + 9_000_000,
          level: pickLevel(rng),
          timestamp,
          rng,
        }),
      ),
    );
  }

  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
  return appendCount;
}

function buildRandomIsoRange(
  rng: () => number,
  firstTimestamp: string,
  lastTimestamp: string,
): { from: string; to: string } {
  const start = Date.parse(firstTimestamp);
  const end = Date.parse(lastTimestamp);
  const span = Math.max(1, end - start);
  const window = Math.max(30 * 60 * 1000, Math.floor(span * 0.03));
  const rangeStart = start + Math.floor(rng() * Math.max(1, span - window));
  const rangeEnd = Math.min(end, rangeStart + window);
  return {
    from: new Date(rangeStart).toISOString(),
    to: new Date(rangeEnd).toISOString(),
  };
}

function formatMetric(metric: Metric): string {
  if (metric.unit === "count") return String(Math.round(metric.value));
  if (metric.unit === "rps") return `${metric.value.toFixed(0)} rec/s`;
  if (metric.unit === "x") return `${metric.value.toFixed(2)}x`;
  return `${metric.value.toFixed(2)} ms`;
}

function assertExpectations(metrics: Metric[]): boolean {
  const metricMap = new Map(metrics.map((metric) => [`${metric.scenario}:${metric.metric}`, metric.value]));

  const coldThroughput = metricMap.get("Indexing:Cold index throughput") ?? 0;
  const directP95 = metricMap.get("Query:Direct query p95") ?? Number.POSITIVE_INFINITY;
  const fieldP95 = metricMap.get("Query:Field query p95") ?? Number.POSITIVE_INFINITY;
  const rangeP95 = metricMap.get("Query:Range query p95") ?? Number.POSITIVE_INFINITY;
  const apiP95 = metricMap.get("API:/api/logs p95");

  const checks = [
    {
      actual: `${coldThroughput.toFixed(0)} rec/s`,
      label: `Cold index throughput >= ${budgets.coldThroughputRps.toFixed(0)} rec/s`,
      ok: coldThroughput >= budgets.coldThroughputRps,
    },
    {
      actual: `${directP95.toFixed(2)}ms`,
      label: `Direct query p95 <= ${budgets.directQueryP95Ms}ms`,
      ok: directP95 <= budgets.directQueryP95Ms,
    },
    {
      actual: `${fieldP95.toFixed(2)}ms`,
      label: `Field query p95 <= ${budgets.fieldQueryP95Ms}ms`,
      ok: fieldP95 <= budgets.fieldQueryP95Ms,
    },
    {
      actual: `${rangeP95.toFixed(2)}ms`,
      label: `Range query p95 <= ${budgets.rangeQueryP95Ms}ms`,
      ok: rangeP95 <= budgets.rangeQueryP95Ms,
    },
  ];

  if (apiP95 !== undefined) {
    checks.push({
      actual: `${apiP95.toFixed(2)}ms`,
      label: `API query p95 <= ${budgets.apiQueryP95Ms}ms`,
      ok: apiP95 <= budgets.apiQueryP95Ms,
    });
  }

  process.stdout.write("\nExpectation checks:\n");
  for (const check of checks) {
    process.stdout.write(`- ${check.ok ? "PASS" : "WARN"}: ${check.label} (actual: ${check.actual})\n`);
  }

  return checks.every((check) => check.ok);
}

async function main(): Promise<void> {
  const rng = createRng(config.seed);
  const metrics: Metric[] = [];
  const tenantIds = Array.from({ length: config.tenantCount }, (_, idx) => `CUST-${pad(idx + 1, 6)}`);
  const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-perf-"));
  const logsPath = join(tempRoot, "logs");
  const dbPath = join(tempRoot, "mikroscope.db");
  await mkdir(logsPath, { recursive: true });

  process.stdout.write("MikroScope performance suite\n");
  process.stdout.write("---------------------------\n");
  process.stdout.write(`Seed: ${config.seed}\n`);
  process.stdout.write(`Tenants/customers: ${config.tenantCount}\n`);
  process.stdout.write(`Seed files: ${config.fileCount}\n`);
  process.stdout.write(`Logs per file: ${config.logsPerFile}\n`);
  process.stdout.write(`Incremental append records: ${config.appendRecordCount}\n`);
  process.stdout.write(`Query iterations: ${config.queryCount}\n`);
  process.stdout.write(`Include API scenario: ${config.includeApi ? "yes" : "no"}\n`);

  const seeded = await seedLogs(logsPath, config.fileCount, config.logsPerFile, tenantIds, rng);
  const db = new LogDatabase(dbPath);
  const indexer = new LogIndexer(db);
  const queryService = new LogQueryService(db);

  try {
    const coldStart = performance.now();
    const coldReport = await indexer.indexDirectory(logsPath);
    const coldMs = performance.now() - coldStart;
    const coldThroughput = coldReport.recordsInserted / Math.max(coldMs / 1000, 0.0001);

    metrics.push(
      {
        scenario: "Indexing",
        metric: "Cold index duration",
        value: coldMs,
        unit: "ms",
      },
      {
        scenario: "Indexing",
        metric: "Cold index throughput",
        value: coldThroughput,
        unit: "rps",
      },
      {
        scenario: "Indexing",
        metric: "Cold index inserted",
        value: coldReport.recordsInserted,
        unit: "count",
      },
    );

    const warmStart = performance.now();
    const warmReport = await indexer.indexDirectory(logsPath);
    const warmMs = performance.now() - warmStart;
    metrics.push(
      {
        scenario: "Indexing",
        metric: "Warm reindex duration",
        value: warmMs,
        unit: "ms",
      },
      {
        scenario: "Indexing",
        metric: "Warm reindex inserted",
        value: warmReport.recordsInserted,
        unit: "count",
      },
      {
        scenario: "Indexing",
        metric: "Warm skipped",
        value: warmReport.recordsSkipped,
        unit: "count",
      },
    );

    // Prime incremental state after full indexing.
    await indexer.indexDirectoryIncremental(logsPath);

    await appendLogs(logsPath, config.appendRecordCount, tenantIds, rng, Date.parse(seeded.lastTimestamp) + 60_000);
    const incrementalStart = performance.now();
    const incrementalReport = await indexer.indexDirectoryIncremental(logsPath);
    const incrementalMs = performance.now() - incrementalStart;
    const incrementalThroughput = incrementalReport.recordsInserted / Math.max(incrementalMs / 1000, 0.0001);
    metrics.push(
      {
        scenario: "Indexing",
        metric: "Incremental reindex duration",
        value: incrementalMs,
        unit: "ms",
      },
      {
        scenario: "Indexing",
        metric: "Incremental throughput",
        value: incrementalThroughput,
        unit: "rps",
      },
      {
        scenario: "Indexing",
        metric: "Incremental inserted",
        value: incrementalReport.recordsInserted,
        unit: "count",
      },
    );

    const directDurations: number[] = [];
    const directHits: number[] = [];
    const fieldDurations: number[] = [];
    const fieldHits: number[] = [];
    const rangeDurations: number[] = [];
    const rangeHits: number[] = [];

    for (let i = 0; i < config.queryCount; i++) {
      const level = levels[randomInt(rng, 0, levels.length - 1)];
      const directStart = performance.now();
      const directEntries = queryService.queryLogsPage({ level, limit: 120 }).entries;
      directDurations.push(performance.now() - directStart);
      directHits.push(directEntries.length);

      const customerId = seeded.sampledCustomerIds[randomInt(rng, 0, seeded.sampledCustomerIds.length - 1)];
      const fieldStart = performance.now();
      const fieldEntries = queryService.queryLogsPage({
        field: "customerId",
        value: customerId,
        limit: 120,
      }).entries;
      fieldDurations.push(performance.now() - fieldStart);
      fieldHits.push(fieldEntries.length);

      const range = buildRandomIsoRange(rng, seeded.firstTimestamp, seeded.lastTimestamp);
      const rangeStart = performance.now();
      const rangeEntries = queryService.queryLogsPage({
        from: range.from,
        to: range.to,
        limit: 250,
      }).entries;
      rangeDurations.push(performance.now() - rangeStart);
      rangeHits.push(rangeEntries.length);
    }

    const directStats = distribution(directDurations);
    const fieldStats = distribution(fieldDurations);
    const rangeStats = distribution(rangeDurations);
    const directMeanHits = distribution(directHits).mean;
    const fieldMeanHits = distribution(fieldHits).mean;
    const rangeMeanHits = distribution(rangeHits).mean;

    metrics.push(
      {
        scenario: "Query",
        metric: "Direct query avg",
        value: directStats.mean,
        unit: "ms",
      },
      {
        scenario: "Query",
        metric: "Direct query p95",
        value: directStats.p95,
        unit: "ms",
      },
      {
        scenario: "Query",
        metric: "Direct query avg hits",
        value: directMeanHits,
        unit: "count",
      },
      {
        scenario: "Query",
        metric: "Field query avg",
        value: fieldStats.mean,
        unit: "ms",
      },
      {
        scenario: "Query",
        metric: "Field query p95",
        value: fieldStats.p95,
        unit: "ms",
      },
      {
        scenario: "Query",
        metric: "Field query avg hits",
        value: fieldMeanHits,
        unit: "count",
      },
      {
        scenario: "Query",
        metric: "Range query avg",
        value: rangeStats.mean,
        unit: "ms",
      },
      {
        scenario: "Query",
        metric: "Range query p95",
        value: rangeStats.p95,
        unit: "ms",
      },
      {
        scenario: "Query",
        metric: "Range query avg hits",
        value: rangeMeanHits,
        unit: "count",
      },
    );

    if (config.includeApi) {
      const apiToken = "perf-token";
      const startupStart = performance.now();
      const server = await startMikroScopeServer({
        apiToken,
        attachSignalHandlers: false,
        dbPath,
        host: "127.0.0.1",
        logsPath,
        maintenanceIntervalMs: 30 * 60 * 1000,
        minFreeBytes: 1,
        port: 0,
        protocol: "http",
      });
      const startupMs = performance.now() - startupStart;

      try {
        const apiDurations: number[] = [];
        const apiHits: number[] = [];
        const apiIterations = Math.max(20, Math.min(config.queryCount, 200));
        for (let i = 0; i < apiIterations; i++) {
          const level = levels[randomInt(rng, 0, levels.length - 1)];
          const started = performance.now();
          const response = await requestJson(new URL(`/api/logs?level=${level}&limit=100`, server.url), {
            headers: { authorization: `Bearer ${apiToken}` },
          });
          apiDurations.push(performance.now() - started);
          if (response.statusCode !== 200) {
            throw new Error(`Unexpected API status ${response.statusCode}`);
          }
          const body = response.body as { entries?: unknown[] };
          apiHits.push(Array.isArray(body.entries) ? body.entries.length : 0);
        }

        const healthDurations: number[] = [];
        for (let i = 0; i < 30; i++) {
          const started = performance.now();
          const response = await requestJson(new URL("/health", server.url));
          healthDurations.push(performance.now() - started);
          if (response.statusCode !== 200) {
            throw new Error(`Unexpected health status ${response.statusCode}`);
          }
        }

        const apiStats = distribution(apiDurations);
        const apiHitsStats = distribution(apiHits);
        const healthStats = distribution(healthDurations);

        metrics.push(
          {
            scenario: "API",
            metric: "Sidecar startup",
            value: startupMs,
            unit: "ms",
          },
          {
            scenario: "API",
            metric: "/api/logs avg",
            value: apiStats.mean,
            unit: "ms",
          },
          {
            scenario: "API",
            metric: "/api/logs p95",
            value: apiStats.p95,
            unit: "ms",
          },
          {
            scenario: "API",
            metric: "/api/logs avg hits",
            value: apiHitsStats.mean,
            unit: "count",
          },
          {
            scenario: "API",
            metric: "/health avg",
            value: healthStats.mean,
            unit: "ms",
          },
          {
            scenario: "API",
            metric: "/health p95",
            value: healthStats.p95,
            unit: "ms",
          },
        );
      } finally {
        await server.close();
      }
    }
  } finally {
    db.close();
    await rm(tempRoot, { recursive: true, force: true });
  }

  process.stdout.write("\nResults:\n");
  console.table(
    metrics.map((metric) => ({
      scenario: metric.scenario,
      metric: metric.metric,
      value: formatMetric(metric),
    })),
  );

  const passed = assertExpectations(metrics);
  if (!passed && config.failOnBudget) {
    process.stderr.write("\nPerformance expectations failed and PERF_MS_FAIL_ON_BUDGET=true.\n");
    process.exitCode = 1;
  }
}

await main();
