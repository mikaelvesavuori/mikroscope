import { mkdirSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { LogIndexer } from "../infrastructure/indexing/LogIndexer.js";

import type { IndexReport } from "../interfaces/index.js";

type IngestOptions = {
  disableAutoIngest?: boolean;
  ingestAsyncQueue?: boolean;
  ingestIntervalMs?: number;
  ingestMaxBodyBytes?: number;
  ingestProducers?: string;
  ingestQueueFlushMs?: number;
};

export type IngestPolicy = {
  enabled: boolean;
  intervalMs: number;
};

export type IngestState = {
  running: boolean;
  runs: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastDurationMs?: number;
  lastError?: string;
  recordsInsertedLastRun: number;
  recordsInsertedTotal: number;
  recordsSkippedLastRun: number;
  recordsSkippedTotal: number;
  parseErrorsLastRun: number;
  parseErrorsTotal: number;
  linesScannedLastRun: number;
  linesScannedTotal: number;
  filesScannedLastRun: number;
  filesScannedTotal: number;
  lastMode?: IndexReport["mode"];
};

export type IngestAuthPolicy = {
  enabled: boolean;
  maxBodyBytes: number;
  producerByToken: Map<string, string>;
};

export type IngestQueuePolicy = {
  enabled: boolean;
  flushMs: number;
};

export type IngestQueueItem = {
  producerId: string;
  records: Array<Record<string, unknown>>;
};

export type IngestQueueState = {
  batchesFlushed: number;
  batchesQueued: number;
  draining: boolean;
  lastError?: string;
  lastFlushAt?: string;
  pending: IngestQueueItem[];
  pendingRecords: number;
  recordsFlushed: number;
  recordsQueued: number;
  timer?: ReturnType<typeof setTimeout>;
};

export type IngestQueueContext = {
  indexer: LogIndexer;
  ingest: IngestState;
  ingestQueuePolicy: IngestQueuePolicy;
  ingestQueueState: IngestQueueState;
  logsPath: string;
};

const DEFAULT_INGEST_INTERVAL_MS = 2_000;
const DEFAULT_INGEST_MAX_BODY_BYTES = 1_048_576;
const DEFAULT_INGEST_QUEUE_FLUSH_MS = 25;
const PRODUCER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function parsePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export function createIngestPolicy(options: IngestOptions): IngestPolicy {
  const disableAutoIngest = parseBoolean(
    options.disableAutoIngest ?? process.env.MIKROSCOPE_DISABLE_AUTO_INGEST,
    false,
  );
  const intervalMs = Math.max(
    250,
    parsePositiveNumber(
      options.ingestIntervalMs ?? process.env.MIKROSCOPE_INGEST_INTERVAL_MS,
      DEFAULT_INGEST_INTERVAL_MS,
    ),
  );

  return {
    enabled: !disableAutoIngest,
    intervalMs,
  };
}

function parseIngestProducerMappings(value: string | undefined): Map<string, string> {
  if (!value || value.trim().length === 0) return new Map<string, string>();

  const mappings = new Map<string, string>();
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new Error(`Invalid ingest producer mapping "${entry}". Expected "token=producerId".`);
    }

    const token = entry.slice(0, separatorIndex).trim();
    const producerId = entry.slice(separatorIndex + 1).trim();
    if (!token || !producerId) {
      throw new Error(
        `Invalid ingest producer mapping "${entry}". Expected non-empty token and producerId.`,
      );
    }
    if (!PRODUCER_ID_PATTERN.test(producerId)) {
      throw new Error(
        `Invalid producerId "${producerId}". Allowed pattern: ${PRODUCER_ID_PATTERN.source}`,
      );
    }
    if (mappings.has(token)) {
      throw new Error("Duplicate ingest producer mapping token detected.");
    }

    mappings.set(token, producerId);
  }

  return mappings;
}

export function createIngestAuthPolicy(options: IngestOptions): IngestAuthPolicy {
  const producerByToken = parseIngestProducerMappings(
    options.ingestProducers ?? process.env.MIKROSCOPE_INGEST_PRODUCERS,
  );
  const maxBodyBytes = Math.max(
    1_024,
    parsePositiveNumber(
      options.ingestMaxBodyBytes ?? process.env.MIKROSCOPE_INGEST_MAX_BODY_BYTES,
      DEFAULT_INGEST_MAX_BODY_BYTES,
    ),
  );

  return {
    enabled: producerByToken.size > 0,
    maxBodyBytes,
    producerByToken,
  };
}

export function createIngestQueuePolicy(options: IngestOptions): IngestQueuePolicy {
  const enabled = parseBoolean(
    options.ingestAsyncQueue ?? process.env.MIKROSCOPE_INGEST_ASYNC_QUEUE,
    false,
  );
  const flushMs = Math.max(
    0,
    parsePositiveNumber(
      options.ingestQueueFlushMs ?? process.env.MIKROSCOPE_INGEST_QUEUE_FLUSH_MS,
      DEFAULT_INGEST_QUEUE_FLUSH_MS,
    ),
  );

  return {
    enabled,
    flushMs,
  };
}

export function createIngestState(): IngestState {
  return {
    running: false,
    runs: 0,
    recordsInsertedLastRun: 0,
    recordsInsertedTotal: 0,
    recordsSkippedLastRun: 0,
    recordsSkippedTotal: 0,
    parseErrorsLastRun: 0,
    parseErrorsTotal: 0,
    linesScannedLastRun: 0,
    linesScannedTotal: 0,
    filesScannedLastRun: 0,
    filesScannedTotal: 0,
  };
}

export function createIngestQueueState(): IngestQueueState {
  return {
    batchesFlushed: 0,
    batchesQueued: 0,
    draining: false,
    pending: [],
    pendingRecords: 0,
    recordsFlushed: 0,
    recordsQueued: 0,
  };
}

type IncrementalIngestContext = {
  indexer: LogIndexer;
  ingest: IngestState;
  logsPath: string;
};

export async function runIncrementalIngest(context: IncrementalIngestContext): Promise<void> {
  if (context.ingest.running) return;
  context.ingest.running = true;
  context.ingest.runs++;
  context.ingest.lastRunAt = new Date().toISOString();
  const started = performance.now();

  try {
    const report = await context.indexer.indexDirectoryIncremental(context.logsPath);
    context.ingest.recordsInsertedLastRun = report.recordsInserted;
    context.ingest.recordsInsertedTotal += report.recordsInserted;
    context.ingest.recordsSkippedLastRun = report.recordsSkipped;
    context.ingest.recordsSkippedTotal += report.recordsSkipped;
    context.ingest.parseErrorsLastRun = report.parseErrors;
    context.ingest.parseErrorsTotal += report.parseErrors;
    context.ingest.linesScannedLastRun = report.linesScanned;
    context.ingest.linesScannedTotal += report.linesScanned;
    context.ingest.filesScannedLastRun = report.filesScanned;
    context.ingest.filesScannedTotal += report.filesScanned;
    context.ingest.lastMode = report.mode;
    context.ingest.lastSuccessAt = new Date().toISOString();
    context.ingest.lastError = undefined;
  } catch (error) {
    context.ingest.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    context.ingest.lastDurationMs = Number((performance.now() - started).toFixed(2));
    context.ingest.running = false;
  }
}

export function parseIngestPayload(payload: unknown): unknown[] | undefined {
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return undefined;
  const logs = (payload as { logs?: unknown }).logs;
  return Array.isArray(logs) ? logs : undefined;
}

export function normalizeIngestRecord(
  value: unknown,
  producerId: string,
  receivedAt: string,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;

  const record = { ...(value as Record<string, unknown>) };
  record.producerId = producerId;
  record.ingestedAt = receivedAt;

  return record;
}

async function writeIngestBatch(
  logsPath: string,
  producerId: string,
  records: Array<Record<string, unknown>>,
): Promise<void> {
  if (records.length === 0) return;
  const resolvedLogsPath = resolve(logsPath);
  const dayLabel = new Date().toISOString().slice(0, 10);
  const producerDirectory = join(resolvedLogsPath, "ingest", producerId);
  mkdirSync(producerDirectory, { recursive: true });
  const targetFile = join(producerDirectory, `${dayLabel}.ndjson`);
  const lines = records.map((record) => JSON.stringify(record)).join("\n");
  await appendFile(targetFile, `${lines}\n`, "utf8");
}

function mergeIngestQueueItems(items: IngestQueueItem[]): IngestQueueItem[] {
  const recordsByProducer = new Map<string, Array<Record<string, unknown>>>();

  for (const item of items) {
    const existing = recordsByProducer.get(item.producerId);
    if (existing) {
      existing.push(...item.records);
      continue;
    }
    recordsByProducer.set(item.producerId, [...item.records]);
  }

  const merged: IngestQueueItem[] = [];
  for (const [producerId, records] of recordsByProducer.entries()) {
    merged.push({ producerId, records });
  }
  return merged;
}

export async function flushIngestQueueBatch(
  context: IngestQueueContext,
  items: IngestQueueItem[],
): Promise<void> {
  if (items.length === 0) return;

  const merged = mergeIngestQueueItems(items);
  for (const item of merged) {
    await writeIngestBatch(context.logsPath, item.producerId, item.records);
  }

  const flushedRecordCount = merged.reduce((sum, item) => sum + item.records.length, 0);
  context.ingestQueueState.recordsFlushed += flushedRecordCount;
  context.ingestQueueState.batchesFlushed += merged.length;
  context.ingestQueueState.lastFlushAt = new Date().toISOString();
  context.ingestQueueState.lastError = undefined;

  await runIncrementalIngest(context);
}

function scheduleIngestQueueFlush(context: IngestQueueContext): void {
  if (context.ingestQueueState.draining) return;
  if (context.ingestQueueState.timer) return;

  const timer = setTimeout(() => {
    context.ingestQueueState.timer = undefined;
    void drainIngestQueue(context);
  }, context.ingestQueuePolicy.flushMs);
  timer.unref?.();
  context.ingestQueueState.timer = timer;
}

export function enqueueIngestQueueBatch(context: IngestQueueContext, item: IngestQueueItem): void {
  if (item.records.length === 0) return;

  context.ingestQueueState.pending.push(item);
  context.ingestQueueState.pendingRecords += item.records.length;
  context.ingestQueueState.batchesQueued++;
  context.ingestQueueState.recordsQueued += item.records.length;
  scheduleIngestQueueFlush(context);
}

export async function drainIngestQueue(context: IngestQueueContext): Promise<void> {
  if (context.ingestQueueState.draining) return;
  context.ingestQueueState.draining = true;

  try {
    while (context.ingestQueueState.pending.length > 0) {
      const pendingItems = context.ingestQueueState.pending.splice(
        0,
        context.ingestQueueState.pending.length,
      );
      const pendingRecordCount = pendingItems.reduce((sum, item) => sum + item.records.length, 0);
      context.ingestQueueState.pendingRecords -= pendingRecordCount;

      try {
        await flushIngestQueueBatch(context, pendingItems);
      } catch (error) {
        context.ingestQueueState.lastError = error instanceof Error ? error.message : String(error);
        context.ingestQueueState.pending.unshift(...pendingItems);
        context.ingestQueueState.pendingRecords += pendingRecordCount;
        break;
      }
    }
  } finally {
    context.ingestQueueState.draining = false;
    if (context.ingestQueueState.pending.length > 0) {
      scheduleIngestQueueFlush(context);
    }
  }
}
