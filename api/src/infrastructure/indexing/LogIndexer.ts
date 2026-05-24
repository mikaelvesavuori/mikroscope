import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import readline from "node:readline";

import type { IndexReport, JsonValue, LogRecord } from "../../interfaces/index.js";

import type { LogDatabase } from "../persistence/LogDatabase.js";

function isScalar(value: JsonValue | undefined): value is string | number | boolean | null {
  const type = typeof value;
  return value === null || type === "string" || type === "number" || type === "boolean";
}

function normalizeMessage(value: JsonValue | undefined): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

function normalizeTimestamp(value: JsonValue | undefined): string {
  if (typeof value === "string" && value.length > 0) return value;
  return new Date().toISOString();
}

function normalizeLevel(value: JsonValue | undefined): string {
  if (typeof value === "string" && value.length > 0) return value.toUpperCase();
  return "INFO";
}

function normalizeEvent(record: LogRecord): string {
  if (typeof record.event === "string" && record.event.length > 0) return record.event;
  if (typeof record.message === "string" && record.message.length > 0) return record.message;
  return "log.event";
}

function normalizeAudit(record: LogRecord, filePath: string): boolean {
  const value = record.audit;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  const normalizedPath = filePath.toLowerCase();
  return normalizedPath.includes(`${sep}audit${sep}`);
}

async function listNdjsonFiles(rootPath: string): Promise<string[]> {
  const files: string[] = [];
  const stack = [resolve(rootPath)];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = await readdir(current, { withFileTypes: true }).catch((error: unknown) => {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    });

    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".ndjson") {
        files.push(fullPath);
      }
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function createReport(mode: "full" | "incremental"): IndexReport {
  return {
    filesScanned: 0,
    linesScanned: 0,
    recordsInserted: 0,
    recordsSkipped: 0,
    parseErrors: 0,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    mode,
  };
}

type IncrementalFileState = {
  byteOffset: number;
  fileSize: number;
  lineNumber: number;
  mtimeMs: number;
};

export class LogIndexer {
  private readonly incrementalState = new Map<string, IncrementalFileState>();

  constructor(private readonly db: LogDatabase) {}

  resetIncrementalState(): void {
    this.incrementalState.clear();
  }

  async indexDirectory(logsPath: string): Promise<IndexReport> {
    const report = createReport("full");

    const files = await listNdjsonFiles(logsPath);
    report.filesScanned = files.length;

    for (const filePath of files) {
      await this.indexFileFull(logsPath, filePath, report);
    }

    report.finishedAt = new Date().toISOString();
    return report;
  }

  async indexDirectoryIncremental(logsPath: string): Promise<IndexReport> {
    const report = createReport("incremental");
    const files = await listNdjsonFiles(logsPath);
    const knownFiles = new Set<string>();
    report.filesScanned = files.length;

    for (const filePath of files) {
      const resolvedFilePath = resolve(filePath);
      knownFiles.add(resolvedFilePath);
      await this.indexFileIncremental(logsPath, resolvedFilePath, report);
    }

    for (const trackedFile of this.incrementalState.keys()) {
      if (!knownFiles.has(trackedFile)) this.incrementalState.delete(trackedFile);
    }

    report.finishedAt = new Date().toISOString();
    return report;
  }

  private async indexFileFull(
    rootPath: string,
    filePath: string,
    report: IndexReport,
  ): Promise<void> {
    const stream = createReadStream(filePath, { encoding: "utf8" });
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lineNumber = 0;
    const sourceFile = relative(resolve(rootPath), resolve(filePath)).split(sep).join("/");

    for await (const line of reader) {
      lineNumber++;
      report.linesScanned++;
      this.processLine({
        filePath,
        line,
        lineNumber,
        report,
        sourceFile,
      });
    }
  }

  private async indexFileIncremental(
    rootPath: string,
    filePath: string,
    report: IndexReport,
  ): Promise<void> {
    const sourceFile = relative(resolve(rootPath), resolve(filePath)).split(sep).join("/");
    // biome-ignore lint/suspicious/noExplicitAny: OK
    let fileStats: any;
    try {
      fileStats = await stat(filePath);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        this.incrementalState.delete(filePath);
        return;
      }
      throw error;
    }

    const previousState = this.incrementalState.get(filePath);
    const hasValidOffset =
      previousState && Number.isFinite(previousState.byteOffset) && previousState.byteOffset >= 0;

    const rewrittenInPlace = Boolean(
      previousState &&
        (fileStats.size < previousState.byteOffset ||
          (Number.isFinite(previousState.mtimeMs) &&
            fileStats.mtimeMs !== previousState.mtimeMs &&
            fileStats.size === previousState.byteOffset)),
    );

    const shouldResume =
      hasValidOffset &&
      !rewrittenInPlace &&
      previousState &&
      fileStats.size >= previousState.byteOffset;

    if (previousState && hasValidOffset && !shouldResume) {
      // File was truncated/rotated in place. Reset persisted rows for this source to avoid line-number collisions.
      this.db.deleteEntriesForSourceFile(sourceFile);
    }

    const startOffset = shouldResume ? previousState.byteOffset : 0;
    let lineNumber = shouldResume ? previousState.lineNumber : 0;
    let bytesRead = 0;

    const stream = createReadStream(filePath, { encoding: "utf8", start: startOffset });
    stream.on("data", (chunk: string | Buffer) => {
      if (typeof chunk === "string") {
        bytesRead += Buffer.byteLength(chunk, "utf8");
      } else {
        bytesRead += chunk.length;
      }
    });

    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of reader) {
      lineNumber++;
      report.linesScanned++;
      this.processLine({
        filePath,
        line,
        lineNumber,
        report,
        sourceFile,
      });
    }

    this.incrementalState.set(filePath, {
      byteOffset: startOffset + bytesRead,
      fileSize: fileStats.size,
      lineNumber,
      mtimeMs: fileStats.mtimeMs,
    });
  }

  private processLine(input: {
    filePath: string;
    line: string;
    lineNumber: number;
    report: IndexReport;
    sourceFile: string;
  }): void {
    const trimmed = input.line.trim();
    if (!trimmed) return;

    let record: LogRecord;
    try {
      record = JSON.parse(trimmed) as LogRecord;
    } catch {
      input.report.parseErrors++;
      return;
    }

    const upsertResult = this.db.upsertEntry({
      timestamp: normalizeTimestamp(record.timestamp),
      level: normalizeLevel(record.level),
      event: normalizeEvent(record),
      message: normalizeMessage(record.message),
      isAudit: normalizeAudit(record, input.filePath),
      dataJson: JSON.stringify(record),
      sourceFile: input.sourceFile,
      lineNumber: input.lineNumber,
    });

    if (!upsertResult.inserted) {
      input.report.recordsSkipped++;
      return;
    }

    for (const [key, value] of Object.entries(record)) {
      if (!isScalar(value)) continue;
      this.db.upsertField(upsertResult.entryId, key, String(value));
    }

    input.report.recordsInserted++;
  }
}
