import { appendFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { LogQueryService } from "../src/application/services/LogQueryService.js";
import { LogIndexer } from "../src/infrastructure/indexing/LogIndexer.js";
import { LogDatabase } from "../src/infrastructure/persistence/LogDatabase.js";

function createLogLine(input: {
  timestamp: string;
  level: string;
  event: string;
  message: string;
  audit?: boolean;
  component?: string;
  correlationId?: string;
  customerId?: string;
  requestId?: string;
}): string {
  return JSON.stringify(input);
}

const cleanupPaths: string[] = [];

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (!path) continue;
    await rm(path, { recursive: true, force: true });
  }
});

describe("MikroScope indexing and querying", () => {
  it("indexes NDJSON logs and supports filtering by level and top-level fields", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-test-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    const nestedDir = join(logsDir, "nested");
    await mkdir(nestedDir, { recursive: true });

    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      [
        createLogLine({
          timestamp: "2026-02-17T10:00:00.000Z",
          level: "INFO",
          event: "order.created",
          message: "order.created",
          customerId: "CUST-1",
          requestId: "REQ-1",
        }),
        "this-is-not-json",
        createLogLine({
          timestamp: "2026-02-17T10:00:01.000Z",
          level: "ERROR",
          event: "order.failed",
          message: "order.failed",
          customerId: "CUST-1",
          requestId: "REQ-2",
        }),
      ].join("\n"),
      "utf8",
    );

    await writeFile(
      join(nestedDir, "supplier.ndjson"),
      createLogLine({
        timestamp: "2026-02-17T10:00:02.000Z",
        level: "INFO",
        event: "supplier.viewed-orders",
        message: "supplier.viewed-orders",
        audit: true,
        customerId: "CUST-2",
        requestId: "REQ-3",
      }),
      "utf8",
    );

    const dbPath = join(tempRoot, "mikroscope.db");
    const db = new LogDatabase(dbPath);
    const indexer = new LogIndexer(db);
    const queryService = new LogQueryService(db);

    try {
      const firstRun = await indexer.indexDirectory(logsDir);
      expect(firstRun.filesScanned).toBe(2);
      expect(firstRun.linesScanned).toBe(4);
      expect(firstRun.recordsInserted).toBe(3);
      expect(firstRun.recordsSkipped).toBe(0);
      expect(firstRun.parseErrors).toBe(1);

      const secondRun = await indexer.indexDirectory(logsDir);
      expect(secondRun.recordsInserted).toBe(0);
      expect(secondRun.recordsSkipped).toBe(3);

      const customerOne = queryService.queryLogsPage({
        field: "customerId",
        value: "CUST-1",
        limit: 10,
      }).entries;
      expect(customerOne.length).toBe(2);
      expect(customerOne.every((entry) => entry.data.customerId === "CUST-1")).toBe(true);

      const errorEntries = queryService.queryLogsPage({
        level: "ERROR",
        limit: 10,
      }).entries;
      expect(errorEntries.length).toBe(1);
      expect(errorEntries[0].event).toBe("order.failed");
      expect(errorEntries[0].data.requestId).toBe("REQ-2");

      const auditEntries = queryService.queryLogsPage({
        audit: true,
        limit: 10,
      }).entries;
      expect(auditEntries.length).toBe(1);
      expect(auditEntries[0].event).toBe("supplier.viewed-orders");
    } finally {
      db.close();
    }
  });

  it("returns zero scans for missing log directories instead of throwing", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-missing-"));
    cleanupPaths.push(tempRoot);

    const db = new LogDatabase(join(tempRoot, "mikroscope.db"));
    const indexer = new LogIndexer(db);

    try {
      const report = await indexer.indexDirectory(join(tempRoot, "does-not-exist"));
      expect(report.filesScanned).toBe(0);
      expect(report.linesScanned).toBe(0);
      expect(report.recordsInserted).toBe(0);
      expect(report.parseErrors).toBe(0);
    } finally {
      db.close();
    }
  });

  it("incrementally indexes appended lines without duplicate scans", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-incremental-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    const logFile = join(logsDir, "orderbutler.ndjson");

    await writeFile(
      logFile,
      `${createLogLine({
        timestamp: "2026-02-17T10:00:00.000Z",
        level: "INFO",
        event: "order.created",
        message: "order.created ".repeat(40),
        requestId: "REQ-1",
      })}\n`,
      "utf8",
    );

    const db = new LogDatabase(join(tempRoot, "mikroscope.db"));
    const indexer = new LogIndexer(db);
    const queryService = new LogQueryService(db);

    try {
      const firstRun = await indexer.indexDirectoryIncremental(logsDir);
      expect(firstRun.mode).toBe("incremental");
      expect(firstRun.recordsInserted).toBe(1);

      await appendFile(
        logFile,
        `${createLogLine({
          timestamp: "2026-02-17T10:00:01.000Z",
          level: "ERROR",
          event: "order.failed",
          message: "order.failed",
          requestId: "REQ-2",
        })}\n`,
        "utf8",
      );

      const secondRun = await indexer.indexDirectoryIncremental(logsDir);
      expect(secondRun.recordsInserted).toBe(1);
      expect(secondRun.recordsSkipped).toBe(0);
      expect(secondRun.linesScanned).toBe(1);

      const thirdRun = await indexer.indexDirectoryIncremental(logsDir);
      expect(thirdRun.recordsInserted).toBe(0);
      expect(thirdRun.linesScanned).toBe(0);

      const entries = queryService.queryLogsPage({ limit: 10 }).entries;
      expect(entries.length).toBe(2);
    } finally {
      db.close();
    }
  });

  it("reindexes truncated files in incremental mode without stale line-number collisions", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-truncated-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    const logFile = join(logsDir, "orderbutler.ndjson");

    await writeFile(
      logFile,
      `${createLogLine({
        timestamp: "2026-02-17T10:00:00.000Z",
        level: "INFO",
        event: "order.created",
        message: "order.created ".repeat(40),
        requestId: "REQ-1",
      })}\n`,
      "utf8",
    );

    const db = new LogDatabase(join(tempRoot, "mikroscope.db"));
    const indexer = new LogIndexer(db);
    const queryService = new LogQueryService(db);

    try {
      const firstRun = await indexer.indexDirectoryIncremental(logsDir);
      expect(firstRun.recordsInserted).toBe(1);

      await writeFile(
        logFile,
        `${createLogLine({
          timestamp: "2026-02-17T10:05:00.000Z",
          level: "ERROR",
          event: "order.rewritten",
          message: "order.rewritten",
          requestId: "REQ-2",
        })}\n`,
        "utf8",
      );

      const secondRun = await indexer.indexDirectoryIncremental(logsDir);
      expect(secondRun.recordsInserted).toBe(1);
      expect(secondRun.recordsSkipped).toBe(0);

      const entries = queryService.queryLogsPage({ limit: 10 }).entries;
      expect(entries.length).toBe(1);
      expect(entries[0].event).toBe("order.rewritten");
      expect(entries[0].data.requestId).toBe("REQ-2");
    } finally {
      db.close();
    }
  });

  it("supports deterministic cursor pagination and ignores malformed cursors", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-cursor-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      [
        createLogLine({
          timestamp: "2026-02-17T10:00:00.000Z",
          level: "INFO",
          event: "event.one",
          message: "event.one",
        }),
        createLogLine({
          timestamp: "2026-02-17T10:01:00.000Z",
          level: "INFO",
          event: "event.two",
          message: "event.two",
        }),
        createLogLine({
          timestamp: "2026-02-17T10:02:00.000Z",
          level: "INFO",
          event: "event.three",
          message: "event.three",
        }),
      ].join("\n"),
      "utf8",
    );

    const db = new LogDatabase(join(tempRoot, "mikroscope.db"));
    const indexer = new LogIndexer(db);
    const queryService = new LogQueryService(db);

    try {
      await indexer.indexDirectory(logsDir);
      const firstPage = queryService.queryLogsPage({ limit: 1 });
      expect(firstPage.entries.length).toBe(1);
      expect(firstPage.hasMore).toBe(true);
      expect(typeof firstPage.nextCursor).toBe("string");

      const secondPage = queryService.queryLogsPage({
        cursor: firstPage.nextCursor,
        limit: 1,
      });
      expect(secondPage.entries.length).toBe(1);
      expect(secondPage.entries[0].id).not.toBe(firstPage.entries[0].id);

      const malformedCursorPage = queryService.queryLogsPage({
        cursor: "not-a-valid-cursor",
        limit: 1,
      });
      expect(malformedCursorPage.entries.length).toBe(1);
      expect(malformedCursorPage.entries[0].id).toBe(firstPage.entries[0].id);
    } finally {
      db.close();
    }
  });

  it("aggregates by level, field, and correlation fallback", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-aggregate-"));
    cleanupPaths.push(tempRoot);

    const logsDir = join(tempRoot, "logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(
      join(logsDir, "orderbutler.ndjson"),
      [
        createLogLine({
          timestamp: "2026-02-17T10:00:00.000Z",
          level: "INFO",
          event: "order.created",
          message: "order.created",
          component: "orders",
          correlationId: "CORR-1",
          requestId: "REQ-1",
        }),
        createLogLine({
          timestamp: "2026-02-17T10:01:00.000Z",
          level: "ERROR",
          event: "order.failed",
          message: "order.failed",
          component: "orders",
          correlationId: "CORR-1",
          requestId: "REQ-2",
        }),
        createLogLine({
          timestamp: "2026-02-17T10:02:00.000Z",
          level: "ERROR",
          event: "supplier.failed",
          message: "supplier.failed",
          component: "supplier",
          requestId: "REQ-3",
        }),
      ].join("\n"),
      "utf8",
    );

    const db = new LogDatabase(join(tempRoot, "mikroscope.db"));
    const indexer = new LogIndexer(db);
    const queryService = new LogQueryService(db);

    try {
      await indexer.indexDirectory(logsDir);

      const byLevel = queryService.aggregateLogs({ limit: 10 }, "level");
      const errorBucket = byLevel.find((item) => item.key === "ERROR");
      expect(errorBucket?.count).toBe(2);

      const byComponent = queryService.aggregateLogs({ limit: 10 }, "field", "component");
      const ordersBucket = byComponent.find((item) => item.key === "orders");
      expect(ordersBucket?.count).toBe(2);

      const byCorrelation = queryService.aggregateLogs({ limit: 10 }, "correlation");
      const corrOneBucket = byCorrelation.find((item) => item.key === "CORR-1");
      const requestFallbackBucket = byCorrelation.find((item) => item.key === "REQ-3");
      expect(corrOneBucket?.count).toBe(2);
      expect(requestFallbackBucket?.count).toBe(1);
    } finally {
      db.close();
    }
  });

  it("prunes old rows and vacuums SQLite index", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "mikroscope-prune-"));
    cleanupPaths.push(tempRoot);

    const db = new LogDatabase(join(tempRoot, "mikroscope.db"));

    try {
      const oldEntry = db.upsertEntry({
        timestamp: "2025-01-01T00:00:00.000Z",
        level: "INFO",
        event: "old.event",
        message: "old.event",
        isAudit: false,
        dataJson: JSON.stringify({ event: "old.event" }),
        sourceFile: "old.ndjson",
        lineNumber: 1,
      });
      db.upsertField(oldEntry.entryId, "event", "old.event");

      const oldAuditEntry = db.upsertEntry({
        timestamp: "2025-01-01T00:00:00.000Z",
        level: "INFO",
        event: "old.audit.event",
        message: "old.audit.event",
        isAudit: true,
        dataJson: JSON.stringify({ event: "old.audit.event", audit: true }),
        sourceFile: "audit/old-audit.ndjson",
        lineNumber: 1,
      });
      db.upsertField(oldAuditEntry.entryId, "audit", "true");

      const freshEntry = db.upsertEntry({
        timestamp: "2026-02-17T00:00:00.000Z",
        level: "INFO",
        event: "new.event",
        message: "new.event",
        isAudit: false,
        dataJson: JSON.stringify({ event: "new.event" }),
        sourceFile: "new.ndjson",
        lineNumber: 1,
      });
      db.upsertField(freshEntry.entryId, "event", "new.event");

      const prune = db.pruneByRetention({
        normalCutoffIso: "2026-01-01T00:00:00.000Z",
        auditCutoffIso: "2024-01-01T00:00:00.000Z",
      });
      expect(prune.entriesDeleted).toBe(1);
      expect(prune.normalEntriesDeleted).toBe(1);
      expect(prune.auditEntriesDeleted).toBe(0);
      expect(prune.fieldsDeleted).toBe(1);

      db.vacuum();
      const stats = db.getStats();
      expect(stats.entryCount).toBe(2);
      expect(stats.fieldCount).toBe(2);
    } finally {
      db.close();
    }
  });
});
